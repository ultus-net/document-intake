import test from "node:test";
import assert from "node:assert/strict";
import { MemoryEventLog } from "./events.js";
import { fixedClock } from "./fakes.js";

test("assigns monotonic seq and clock timestamps", async () => {
  const log = new MemoryEventLog(fixedClock("2026-01-02T03:04:05Z"));
  await log.append({ runId: "r1", correlationId: "c1", stage: "ingest", event: "ingest.accepted", summary: "one document" });
  const second = await log.append({ runId: "r1", correlationId: "c1", stage: "extract", event: "extract.complete", summary: "3 fields" });
  assert.equal(second.seq, 1);
  assert.equal(second.ts, "2026-01-02T03:04:05.000Z");
  assert.deepEqual((await log.read()).map((e) => e.event), ["ingest.accepted", "extract.complete"]);
});
