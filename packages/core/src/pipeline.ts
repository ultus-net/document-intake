import type { Deps } from "./ports.js";
import type { DocumentRef, Run, SourceDocument } from "./types.js";
import { idempotencyKey } from "./idempotency.js";
import { resolveLines } from "./stages/resolve.js";
import { decide } from "./stages/decide.js";
import { postRecord } from "./stages/post.js";

export function documentRef(doc: SourceDocument): DocumentRef {
  return { messageId: doc.messageId, filename: doc.filename, receivedAt: doc.receivedAt };
}

export async function processDocument(doc: SourceDocument, deps: Deps): Promise<Run> {
  const key = idempotencyKey(doc);
  const run: Run = {
    id: key.slice(0, 12),
    correlationId: doc.messageId,
    stage: "ingest",
    key,
    document: documentRef(doc),
  };

  const seen = (await deps.log.read()).some(
    (event) => event.event === "ingest.accepted" && event.data?.key === key,
  );
  const existing = await deps.record.find(key);
  if (seen || existing) {
    const duplicate: Run = {
      ...run,
      id: `${run.id}-dup-${(await deps.log.read()).filter((event) => event.event === "ingest.duplicate").length + 1}`,
      duplicate: true,
    };
    await deps.log.append({
      runId: duplicate.id,
      correlationId: run.correlationId,
      stage: "ingest",
      event: "ingest.duplicate",
      summary: `${doc.filename} was already seen`,
      data: { key, document: documentRef(doc) },
    });
    return duplicate;
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

  const lines = await resolveLines(extracted.lines, deps.catalogue);
  await deps.log.append({
    runId: run.id,
    correlationId: run.correlationId,
    stage: "resolve",
    event: "resolve.lines",
    summary: `${lines.length} matchable lines`,
    data: { lines },
  });

  const customer = await deps.directory.resolve(doc, extracted.fields, extracted.identity);
  const decision = decide({ extracted, lines, customer });
  const event =
    decision.outcome === "auto"
      ? "decide.shortcircuit"
      : decision.outcome === "review"
        ? "decide.hold"
        : "decide.reject";
  await deps.log.append({
    runId: run.id,
    correlationId: run.correlationId,
    stage: "decide",
    event,
    summary: decision.reasons.join("; "),
    data: { decision, modelCalls: 0 },
  });

  let finalExtracted = extracted;
  let finalDecision = decision;
  if (decision.outcome === "review" && deps.judge !== undefined) {
    const merged = await deps.judge.merge({ fields: extracted.fields, reasons: decision.reasons });
    finalExtracted = { ...extracted, fields: merged.fields };
    finalDecision = { ...decision, evidence: [...decision.evidence, ...merged.evidence] };
    await deps.log.append({
      runId: run.id,
      correlationId: run.correlationId,
      stage: "decide",
      event: "judge.called",
      summary: `${merged.evidence.length} fields merged for the person`,
      data: { decision: finalDecision, extracted: finalExtracted },
    });
  }

  const decided = {
    ...run,
    stage: "decide" as const,
    extracted: finalExtracted,
    decision: finalDecision,
  };
  if (finalDecision.outcome !== "auto") return decided;

  const posted = await postRecord(decided, deps);
  return { ...decided, stage: "post", posted };
}
