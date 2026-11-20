import type { ResolvedCustomer } from "../ports.js";
import type { Decision, Evidence, ExtractedDocument } from "../types.js";
import { normalise } from "../matching.js";
import type { ResolvedLine } from "./resolve.js";

export interface DecideInput {
  extracted: ExtractedDocument;
  lines: ResolvedLine[];
  customer: ResolvedCustomer;
}

function lineTotal(line: ResolvedLine): number {
  if (line.line.lineTotal !== undefined) return line.line.lineTotal;
  return line.line.quantity * (line.line.unitPrice ?? 0);
}

export function decide(input: DecideInput): Decision {
  const { extracted, lines, customer } = input;
  const evidence: Evidence[] = [];
  const reasons: string[] = [];

  for (const [field, value] of Object.entries(extracted.fields)) {
    evidence.push({ field: `field:${field}`, value, source: "extractor:header" });
  }
  for (const [index, line] of lines.entries()) {
    if (line.sku !== undefined) {
      evidence.push({ field: `line:${index}:sku`, value: line.sku, source: "catalogue:match", rule: line.rule });
    }
    evidence.push({ field: `line:${index}:quantity`, value: line.line.quantity, source: "extractor:line" });
  }
  if (customer.account !== undefined) {
    evidence.push({ field: "customer:account", value: customer.account, source: "directory:resolve" });
  }

  if (extracted.status === "unreadable") {
    return { outcome: "reject", reasons: ["could not read the document"], evidence };
  }
  if (extracted.status === "not-a-document") {
    return { outcome: "reject", reasons: ["not a document we can process"], evidence };
  }
  if (lines.length === 0) {
    return { outcome: "reject", reasons: ["no matchable lines"], evidence };
  }
  if (lines.some((line) => line.rule !== "accept")) {
    const index = lines.findIndex((line) => line.rule !== "accept");
    reasons.push(`line ${index + 1} needs a person`);
  }

  const header = normalise(extracted.fields.company ?? "");
  const identity = normalise(extracted.identity.company ?? "");
  if (header !== "" && identity !== "" && header !== identity) {
    reasons.push("extractor and identity read disagree");
  }
  if (customer.ambiguous) reasons.push("ambiguous customer");

  const total = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  if (
    customer.creditLimitCents !== undefined &&
    total + (customer.openBalanceCents ?? 0) > customer.creditLimitCents
  ) {
    reasons.push("over credit limit");
  }

  const outcome = reasons.some((reason) => reason.startsWith("line "))
    || reasons.includes("extractor and identity read disagree")
    || reasons.includes("ambiguous customer")
    ? "review"
    : "auto";

  if (outcome === "auto" && reasons.length === 0) reasons.push("all lines matched");
  return { outcome, reasons, evidence };
}
