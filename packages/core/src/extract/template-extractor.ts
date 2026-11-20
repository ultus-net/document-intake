import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Extractor } from "../ports.js";
import type { ExtractedDocument, LineItem } from "../types.js";
import { readIdentity } from "./identity.js";

const LINE = /^(.+?)\s+(\d+)(?:\s+([\d.]+))?(?:\s+([\d.]+))?$/;
const TABLE_HEADER = /^Description\s+Qty\b.*\bTotal$/;

function isPdf(bytes: Uint8Array): boolean {
  const magic = new TextDecoder().decode(bytes.subarray(0, 5));
  return magic === "%PDF-";
}

async function textLines(bytes: Uint8Array): Promise<string[]> {
  const task = getDocument({ data: bytes, useSystemFonts: true });
  const doc = await task.promise;
  const lines: string[] = [];
  try {
    for (let number = 1; number <= doc.numPages; number += 1) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      const rows = new Map<number, Array<{ x: number; str: string }>>();
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const key = Math.round(item.transform[5]);
        const row = rows.get(key) ?? [];
        row.push({ x: item.transform[4], str: item.str });
        rows.set(key, row);
      }
      for (const key of [...rows.keys()].sort((a, b) => b - a)) {
        const text = (rows.get(key) ?? [])
          .sort((a, b) => a.x - b.x)
          .map((item) => item.str)
          .join("")
          .replace(/\s+/g, " ")
          .trim();
        if (text !== "") lines.push(text);
      }
    }
  } finally {
    await task.destroy();
  }
  return lines;
}

function parseFields(lines: string[], tableAt: number): Record<string, string> {
  const fields: Record<string, string> = {};
  const first = lines[0];
  if (first !== undefined) fields.company = first;
  for (const line of lines.slice(0, tableAt < 0 ? lines.length : tableAt)) {
    const labelled = /^(Purchase order|Date|Deliver to)\s*:\s*(.+)$/i.exec(line);
    if (labelled === null) continue;
    const key = labelled[1] ?? "";
    const name = key.toLowerCase() === "purchase order" ? "purchaseOrder" : key.toLowerCase() === "deliver to" ? "deliverTo" : "date";
    fields[name] = (labelled[2] ?? "").trim();
  }
  return fields;
}

function parseLines(lines: string[], tableAt: number): LineItem[] {
  if (tableAt < 0) return [];
  const items: LineItem[] = [];
  for (const line of lines.slice(tableAt + 1)) {
    const matched = LINE.exec(line);
    if (matched === null) continue;
    const description = (matched[1] ?? "").trim();
    const quantity = Number(matched[2]);
    if (description === "" || !Number.isFinite(quantity) || quantity <= 0) continue;
    const unitPrice = matched[3] === undefined ? undefined : Math.round(Number(matched[3]) * 100);
    const lineTotal = matched[4] === undefined ? undefined : Math.round(Number(matched[4]) * 100);
    items.push({
      description,
      quantity,
      ...(unitPrice === undefined ? {} : { unitPrice }),
      ...(lineTotal === undefined ? {} : { lineTotal }),
    });
  }
  return items;
}

export function createTemplateExtractor(): Extractor {
  return {
    async extract(doc) {
      if (!isPdf(doc.bytes)) {
        return { status: "not-a-document", fields: {}, identity: {}, lines: [] };
      }

      let lines: string[];
      try {
        lines = await textLines(doc.bytes);
      } catch {
        return { status: "unreadable", fields: {}, identity: {}, lines: [] };
      }
      if (lines.length === 0) {
        return { status: "unreadable", fields: {}, identity: {}, lines: [] };
      }

      const tableAt = lines.findIndex((line) => TABLE_HEADER.test(line));
      const fields = parseFields(lines, tableAt);
      const items = parseLines(lines, tableAt);
      const hasOrderFields = fields.purchaseOrder !== undefined || fields.date !== undefined;
      if (!hasOrderFields && items.length === 0) {
        return { status: "not-a-document", fields: {}, identity: {}, lines: [] };
      }

      const result: ExtractedDocument = {
        status: "ok",
        fields,
        identity: readIdentity(lines.join("\n")),
        lines: items,
      };
      return result;
    },
  };
}
