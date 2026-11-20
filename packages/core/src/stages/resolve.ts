import type { Catalogue } from "../ports.js";
import type { LineItem } from "../types.js";
import { classify } from "../matching.js";

const SERVICE_WORDS = ["freight", "delivery", "fee", "surcharge", "note"];

export interface ResolvedLine {
  line: LineItem;
  sku?: string;
  score: number;
  rule: "accept" | "hold" | "reject";
}

export function isServiceLine(line: LineItem): boolean {
  const text = line.description.toLowerCase();
  return SERVICE_WORDS.some((word) => text.includes(word));
}

export async function resolveLines(
  lines: LineItem[],
  catalogue: Catalogue,
): Promise<ResolvedLine[]> {
  const resolved: ResolvedLine[] = [];
  for (const line of lines) {
    if (isServiceLine(line)) continue;
    const match = await catalogue.match(line.description);
    const rule = classify(match.score, match.exactReference);
    resolved.push({
      line,
      ...(match.sku === undefined ? {} : { sku: match.sku }),
      score: match.score,
      rule,
    });
  }
  return resolved;
}
