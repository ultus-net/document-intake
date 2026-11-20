import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTemplateExtractor } from "./template-extractor.js";
import { readIdentity } from "./identity.js";
import type { SourceDocument } from "../types.js";

const dir = new URL("../../../../fixtures/documents/", import.meta.url);

async function pdf(name: string): Promise<SourceDocument> {
  const bytes = new Uint8Array(await readFile(new URL(`${name}.pdf`, dir)));
  return { messageId: name, filename: `${name}.pdf`, receivedAt: "2026-11-02T00:00:00.000Z", bytes };
}

const extractor = createTemplateExtractor();

test("reads the clean order", async () => {
  const out = await extractor.extract(await pdf("clean-order"));
  assert.equal(out.status, "ok");
  assert.equal(out.fields.purchaseOrder, "PO-1042");
  assert.equal(out.fields.company, "Rata Design");
  assert.equal(out.lines.length, 3);
  assert.deepEqual(out.lines[0], {
    description: "Aurelia Weave 4417",
    quantity: 2,
    unitPrice: 120,
    lineTotal: 240,
  });
});

test("the identity read agrees on a clean order and disagrees on letterhead", async () => {
  const clean = await extractor.extract(await pdf("clean-order"));
  assert.equal(clean.identity.company, "Rata Design");
  assert.equal(clean.identity.email, "ap@rata.example");

  const letterhead = await extractor.extract(await pdf("letterhead"));
  assert.equal(letterhead.fields.company?.toLowerCase(), "northgate interiors");
  assert.equal(letterhead.identity.company, "Kowhai Retail");
  assert.match(letterhead.identity.email ?? "", /buyer@/);
});

test("a statement is not a document", async () => {
  assert.equal((await extractor.extract(await pdf("statement"))).status, "not-a-document");
});

test("a non-PDF is not a document", async () => {
  const docx: SourceDocument = {
    messageId: "memo",
    filename: "memo.docx",
    receivedAt: "2026-11-02T00:00:00.000Z",
    bytes: new TextEncoder().encode("PK\u0003\u0004 not a pdf"),
  };
  assert.equal((await extractor.extract(docx)).status, "not-a-document");
});

test("a PDF with no text layer is unreadable", async () => {
  assert.equal((await extractor.extract(await pdf("blank"))).status, "unreadable");
});

test("a corrupt PDF is unreadable, not a crash", async () => {
  const corrupt: SourceDocument = {
    messageId: "corrupt",
    filename: "corrupt.pdf",
    receivedAt: "2026-11-02T00:00:00.000Z",
    bytes: new TextEncoder().encode("%PDF-1.4\nthis is not a pdf body"),
  };
  assert.equal((await extractor.extract(corrupt)).status, "unreadable");
});

test("the identity read takes the sender email, not the letterhead", () => {
  const identity = readIdentity("Supplier Ltd\norders@supplier.example\n\nBuyer: Tui Interiors <ap@tui.example>");
  assert.deepEqual(identity, { email: "ap@tui.example", company: "Tui Interiors" });
});
