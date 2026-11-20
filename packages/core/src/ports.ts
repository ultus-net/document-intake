import type {
  Clock, Evidence, ExtractedDocument, PostedRecord, SourceDocument,
} from "./types.js";
import type { EventLog } from "./events.js";

export interface Inbox {
  list(): Promise<SourceDocument[]>;
}

export interface Extractor {
  extract(doc: SourceDocument): Promise<ExtractedDocument>;
}

export interface MatchResult {
  sku?: string;
  score: number;
  exactReference: boolean;
  rule: string;
}

export interface Catalogue {
  match(description: string): Promise<MatchResult>;
}

export interface ResolvedCustomer {
  account?: string;
  score: number;
  ambiguous: boolean;
  creditLimitCents?: number;
  openBalanceCents?: number;
}

export interface CustomerDirectory {
  resolve(
    doc: SourceDocument,
    fields: Record<string, string>,
    identity: Record<string, string>,
  ): Promise<ResolvedCustomer>;
}

export interface SystemOfRecord {
  find(key: string): Promise<PostedRecord | undefined>;
  append(record: PostedRecord): Promise<void>;
  list(): Promise<PostedRecord[]>;
}

export interface Notifier {
  notify(message: string): void;
}

export interface Judge {
  merge(input: {
    fields: Record<string, string>;
    reasons: string[];
  }): Promise<{ fields: Record<string, string>; evidence: Evidence[] }>;
}

export interface Deps {
  inbox: Inbox;
  extractor: Extractor;
  catalogue: Catalogue;
  directory: CustomerDirectory;
  record: SystemOfRecord;
  notifier: Notifier;
  clock: Clock;
  log: EventLog;
  judge?: Judge | undefined;
}
