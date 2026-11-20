export type Outcome = "auto" | "review" | "reject";
export type Stage = "ingest" | "extract" | "resolve" | "decide" | "post" | "verify";

export interface Evidence {
  field: string;
  value: unknown;
  source: string;
  rule?: string;
  confidence?: number;
}

export interface Decision {
  outcome: Outcome;
  reasons: string[];
  evidence: Evidence[];
}

export interface Event {
  seq: number;
  ts: string;
  runId: string;
  correlationId: string;
  stage: Stage;
  event: string;
  summary: string;
  data?: Record<string, unknown>;
}

export interface EventInput {
  runId: string;
  correlationId: string;
  stage: Stage;
  event: string;
  summary: string;
  data?: Record<string, unknown>;
}

export interface Clock {
  now(): Date;
}

export interface DocumentRef {
  messageId: string;
  filename: string;
  receivedAt: string;
}

export interface SourceDocument extends DocumentRef {
  bytes: Uint8Array;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
}

export interface ExtractedDocument {
  status: "ok" | "unreadable" | "not-a-document";
  fields: Record<string, string>;
  identity: Record<string, string>;
  lines: LineItem[];
}

export interface PostedRecord {
  idempotencyKey: string;
  runId: string;
  postedAt: string;
  fields: Record<string, unknown>;
  lines: Array<{ sku: string; quantity: number }>;
  decision: Decision;
}

export interface Run {
  id: string;
  correlationId: string;
  stage: Stage;
  document?: DocumentRef;
  extracted?: ExtractedDocument;
  decision?: Decision;
  duplicate?: boolean;
  posted?: PostedRecord;
}
