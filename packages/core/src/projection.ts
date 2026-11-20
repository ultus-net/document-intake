import type { Event, Decision, DocumentRef, ExtractedDocument, PostedRecord, Run } from "./types.js";

export function rebuildRuns(events: Event[]): Run[] {
  const runs = new Map<string, Run>();
  for (const event of events) {
    const run: Run = runs.get(event.runId) ?? {
      id: event.runId,
      correlationId: event.correlationId,
      stage: "ingest",
    };
    run.stage = event.stage;
    const data = event.data ?? {};
    if (data.document !== undefined) run.document = data.document as DocumentRef;
    if (data.extracted !== undefined) run.extracted = data.extracted as ExtractedDocument;
    if (data.decision !== undefined) run.decision = data.decision as Decision;
    if (data.posted !== undefined) run.posted = data.posted as PostedRecord;
    if (event.event === "ingest.duplicate") run.duplicate = true;
    runs.set(event.runId, run);
  }
  return [...runs.values()];
}
