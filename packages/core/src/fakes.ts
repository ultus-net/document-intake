import type {
  Catalogue, CustomerDirectory, Deps, Extractor, Judge, Notifier,
  ResolvedCustomer, SystemOfRecord,
} from "./ports.js";
import { MemoryEventLog } from "./events.js";
import type { ExtractedDocument, LineItem, PostedRecord, SourceDocument } from "./types.js";
import { fixedClock } from "./fakes-clock.js";

export { fixedClock } from "./fakes-clock.js";

export function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function doc(messageId: string, text = "document"): SourceDocument {
  return {
    messageId,
    filename: `${messageId}.pdf`,
    receivedAt: "2026-01-01T00:00:00.000Z",
    bytes: textBytes(text),
  };
}

export const cleanDoc = (): SourceDocument => doc("clean-order", "three matched lines");
export const letterheadDoc = (): SourceDocument => doc("letterhead", "supplier letterhead");
export const vagueLineDoc = (): SourceDocument => doc("vague-line", "aurelia weave");
export const statementDoc = (): SourceDocument => doc("statement", "account statement");
export const scanDoc = (): SourceDocument => doc("scan", "");
export const freightOnlyDoc = (): SourceDocument => doc("freight-only", "freight rows");
export const ambiguousCustomerDoc = (): SourceDocument => doc("ambiguous-customer", "two companies");
export const overLimitDoc = (): SourceDocument => doc("over-limit", "large order");

const cleanLines: LineItem[] = [
  { description: "aurelia weave 4417", quantity: 2, unitPrice: 12000, lineTotal: 24000 },
  { description: "kowhai broadloom", quantity: 1, unitPrice: 45000, lineTotal: 45000 },
  { description: "underlay standard", quantity: 4, unitPrice: 3500, lineTotal: 14000 },
];

function extracted(input: SourceDocument): ExtractedDocument {
  const base: ExtractedDocument = {
    status: "ok",
    fields: { purchaseOrder: "PO-1042", company: "Northgate Interiors" },
    identity: { company: "Northgate Interiors", email: "buyer@northgate.example" },
    lines: cleanLines,
  };
  switch (input.messageId) {
    case "statement":
      return { status: "not-a-document", fields: {}, identity: {}, lines: [] };
    case "scan":
      return { status: "unreadable", fields: {}, identity: {}, lines: [] };
    case "vague-line":
      return { ...base, lines: [{ description: "aurelia weave", quantity: 3 }] };
    case "freight-only":
      return { ...base, lines: [{ description: "freight", quantity: 1, lineTotal: 9000 }] };
    case "ambiguous-customer":
      return { ...base, fields: { ...base.fields, company: "Northgate Interiors Ltd" } };
    case "over-limit":
      return {
        ...base,
        lines: [{ description: "aurelia weave 4417", quantity: 99, unitPrice: 12000, lineTotal: 1188000 }],
      };
    case "letterhead":
      return {
        ...base,
        fields: { ...base.fields, company: "Northgate Interiors" },
        identity: { company: "Kōwhai Retail", email: "buyer@kowhai.example" },
      };
    default:
      return base;
  }
}

export function stubExtractor(): Extractor {
  return { extract: async (input) => extracted(input) };
}

export function stubCatalogue(): Catalogue {
  return {
    match: async (description) => {
      if (description.trim() === "aurelia weave") {
        return { score: 0.6, exactReference: false, rule: "hold" };
      }
      return { sku: "SKU-1", score: 0.95, exactReference: false, rule: "accept" };
    },
  };
}

export function stubDirectory(): CustomerDirectory {
  return {
    resolve: async (input): Promise<ResolvedCustomer> => {
      if (input.messageId === "ambiguous-customer") {
        return { score: 0.7, ambiguous: true };
      }
      if (input.messageId === "over-limit") {
        return { account: "ACC-1", score: 0.95, ambiguous: false,
          creditLimitCents: 100000, openBalanceCents: 0 };
      }
      return { account: "ACC-1", score: 0.95, ambiguous: false };
    },
  };
}

export function memoryRecord(): SystemOfRecord & { clear(): void } {
  const rows: PostedRecord[] = [];
  return {
    find: async (key) => rows.find((row) => row.idempotencyKey === key),
    append: async (row) => { rows.push(row); },
    list: async () => [...rows],
    clear: () => { rows.length = 0; },
  };
}

export function consoleNotifier(): Notifier {
  return { notify: (message) => console.log(`[notify] ${message}`) };
}

export function happyDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    inbox: { list: async () => [cleanDoc()] },
    extractor: stubExtractor(),
    catalogue: stubCatalogue(),
    directory: stubDirectory(),
    record: memoryRecord(),
    notifier: consoleNotifier(),
    clock: fixedClock("2026-01-02T03:04:05Z"),
    log: new MemoryEventLog(fixedClock("2026-01-02T03:04:05Z")),
    judge: undefined,
    ...overrides,
  };
}

export const throwingJudge = (): Judge => ({
  merge: async () => { throw new Error("judge must not run"); },
});
