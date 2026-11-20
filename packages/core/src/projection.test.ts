import test from "node:test";
import assert from "node:assert/strict";
import { rebuildRuns } from "./projection.js";
import { processDocument } from "./pipeline.js";
import { MemoryEventLog } from "./events.js";
import { cleanDoc, fixedClock, happyDeps, vagueLineDoc } from "./fakes.js";

test("rebuilds a held run from events alone", async () => {
  const deps = happyDeps();
  const run = await processDocument(vagueLineDoc(), deps);
  const [rebuilt] = rebuildRuns(await deps.log.read());
  assert.equal(rebuilt?.id, run.id);
  assert.equal(rebuilt?.decision?.outcome, "review");
  assert.equal(rebuilt?.extracted?.lines.length, 1);
  assert.equal(rebuilt?.stage, "decide");
});

test("rebuilds a posted run", async () => {
  const deps = happyDeps();
  await processDocument(cleanDoc(), deps);
  const [rebuilt] = rebuildRuns(await deps.log.read());
  assert.equal(rebuilt?.stage, "post");
  assert.equal(rebuilt?.posted?.lines.length, 3);
});

test("a later event supersedes the earlier stage", async () => {
  const log = new MemoryEventLog(fixedClock("2026-01-01T00:00:00Z"));
  await log.append({ runId: "r", correlationId: "c", stage: "decide", event: "decide.hold", summary: "held", data: { decision: { outcome: "review", reasons: [], evidence: [] } } });
  await log.append({ runId: "r", correlationId: "c", stage: "post", event: "post.written", summary: "posted" });
  const [run] = rebuildRuns(await log.read());
  assert.equal(run?.stage, "post");
});
