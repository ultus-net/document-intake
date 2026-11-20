import test from "node:test";
import assert from "node:assert/strict";
import { postRecord } from "./stages/post.js";
import { processDocument } from "./pipeline.js";
import { IntakeError } from "./errors.js";
import { cleanDoc, happyDeps } from "./fakes.js";
import type { Run } from "./types.js";

function runWithStaleEvidence(): Run {
  return {
    id: "r1",
    correlationId: "c1",
    stage: "decide",
    extracted: { status: "ok", fields: { purchaseOrder: "NEW" }, identity: {}, lines: [] },
    decision: {
      outcome: "auto",
      reasons: ["all lines matched"],
      evidence: [{ field: "field:purchaseOrder", value: "OLD", source: "extractor:header" }],
    },
  };
}

test("post refuses a value with no matching evidence", async () => {
  await assert.rejects(
    async () => postRecord(runWithStaleEvidence(), happyDeps()),
    (error: unknown) => error instanceof IntakeError && error.code === "no-evidence",
  );
});

test("one document yields one posted record", async () => {
  const deps = happyDeps();
  await processDocument(cleanDoc(), deps);
  await processDocument(cleanDoc(), deps);
  assert.equal((await deps.record.list()).length, 1);
});

test("the clean order's event trail is stable", async () => {
  const deps = happyDeps();
  await processDocument(cleanDoc(), deps);
  assert.deepEqual((await deps.log.read()).map((event) => event.event), [
    "ingest.accepted",
    "extract.complete",
    "resolve.lines",
    "decide.shortcircuit",
    "post.written",
  ]);
});
