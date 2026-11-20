import type { Clock, PostedRecord } from "./types.js";
import type { SystemOfRecord } from "./ports.js";
import type { EventLog } from "./events.js";

export interface VerifyResult {
  key: string;
  runId: string;
  status: "ok" | "missing" | "drift";
  detail: string;
}

export interface VerifyInput {
  log: EventLog;
  record: SystemOfRecord;
  clock: Clock;
}

function latestByKey(records: PostedRecord[]): Map<string, PostedRecord> {
  const latest = new Map<string, PostedRecord>();
  for (const record of records) latest.set(record.idempotencyKey, record);
  return latest;
}

function driftDetail(record: PostedRecord): string | undefined {
  for (const entry of record.decision.evidence) {
    const field = /^field:(.+)$/.exec(entry.field);
    if (field !== null) {
      if (record.fields[field[1] as string] !== entry.value) {
        return `${entry.field} no longer matches its evidence`;
      }
      continue;
    }
    const line = /^line:(\d+):(sku|quantity)$/.exec(entry.field);
    if (line !== null) {
      const stored = record.lines[Number(line[1])] as Record<string, unknown> | undefined;
      if (stored === undefined || stored[line[2] as string] !== entry.value) {
        return `${entry.field} no longer matches its evidence`;
      }
    }
  }
  return undefined;
}

export async function verifyAll(input: VerifyInput, olderThanHours: number): Promise<VerifyResult[]> {
  const events = await input.log.read();
  const posted = events.filter((event) => event.event === "post.written");
  const latest = latestByKey(await input.record.list());
  const cutoff = input.clock.now().getTime() - olderThanHours * 3_600_000;
  const results: VerifyResult[] = [];

  for (const event of posted) {
    const key = event.data?.key;
    if (typeof key !== "string") continue;
    if (new Date(event.ts).getTime() > cutoff) continue;
    const record = latest.get(key);
    if (record === undefined) {
      results.push({ key, runId: event.runId, status: "missing", detail: "not in the record store" });
      continue;
    }
    const drift = driftDetail(record);
    results.push(
      drift === undefined
        ? { key, runId: event.runId, status: "ok", detail: "record matches its evidence" }
        : { key, runId: event.runId, status: "drift", detail: drift },
    );
  }
  return results;
}
