import type { Deps } from "./ports.js";
import type { DocumentRef, Run, SourceDocument } from "./types.js";
import { idempotencyKey } from "./idempotency.js";

export function documentRef(doc: SourceDocument): DocumentRef {
  return { messageId: doc.messageId, filename: doc.filename, receivedAt: doc.receivedAt };
}

export async function processDocument(doc: SourceDocument, deps: Deps): Promise<Run> {
  const key = idempotencyKey(doc);
  const run: Run = {
    id: key.slice(0, 12),
    correlationId: doc.messageId,
    stage: "ingest",
    document: documentRef(doc),
  };

  const seen = (await deps.log.read()).some(
    (event) => event.event === "ingest.accepted" && event.data?.key === key,
  );
  const existing = await deps.record.find(key);
  if (seen || existing) {
    await deps.log.append({
      runId: run.id,
      correlationId: run.correlationId,
      stage: "ingest",
      event: "ingest.duplicate",
      summary: "document already seen",
      data: { key },
    });
    return { ...run, duplicate: true };
  }

  await deps.log.append({
    runId: run.id,
    correlationId: run.correlationId,
    stage: "ingest",
    event: "ingest.accepted",
    summary: `${doc.filename} accepted`,
    data: { key, document: documentRef(doc) },
  });

  const extracted = await deps.extractor.extract(doc);
  await deps.log.append({
    runId: run.id,
    correlationId: run.correlationId,
    stage: "extract",
    event: "extract.complete",
    summary: `${extracted.lines.length} lines, status ${extracted.status}`,
    data: { extracted },
  });

  return { ...run, stage: "extract", extracted };
}
