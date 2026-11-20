import test from "node:test";
import assert from "node:assert/strict";
import { processDocument } from "./pipeline.js";
import { idempotencyKey } from "./idempotency.js";
import { rebuildRuns } from "./projection.js";
import {
  ambiguousCustomerDoc, cleanDoc, freightOnlyDoc, happyDeps, overLimitDoc,
  scanDoc, statementDoc, textBytes, throwingJudge, vagueLineDoc, letterheadDoc,
} from "./fakes.js";

test("the same message twice yields one run and a duplicate event", async () => {
  const deps = happyDeps();
  const first = await processDocument(cleanDoc(), deps);
  const second = await processDocument(cleanDoc(), deps);
  assert.equal(first.duplicate, undefined);
  assert.equal(second.duplicate, true);
  const events = await deps.log.read();
  assert.equal(events.filter((e) => e.event === "ingest.accepted").length, 1);
  assert.ok(events.some((e) => e.event === "ingest.duplicate"));
});

test("a held document is not re-run", async () => {
  const deps = happyDeps();
  await processDocument(vagueLineDoc(), deps);
  assert.equal((await processDocument(vagueLineDoc(), deps)).duplicate, true);
});

test("a rejected document is not re-run either", async () => {
  const deps = happyDeps();
  const first = await processDocument(scanDoc(), deps);
  assert.equal(first.decision?.outcome, "reject");
  const second = await processDocument(scanDoc(), deps);
  assert.equal(second.duplicate, true);
  assert.equal((await deps.log.read()).filter((event) => event.event === "ingest.duplicate").length, 1);
});

test("the length prefix prevents key collisions", () => {
  const a = idempotencyKey({ messageId: "ab", bytes: textBytes("c") });
  const b = idempotencyKey({ messageId: "a", bytes: textBytes("bc") });
  assert.notEqual(a, b);
});

test("an unreadable document rejects with a plain reason", async () => {
  const run = await processDocument(scanDoc(), happyDeps());
  assert.equal(run.decision?.outcome, "reject");
  assert.ok(run.decision?.reasons.includes("could not read the document"));
});

test("a non-document rejects", async () => {
  const run = await processDocument(statementDoc(), happyDeps());
  assert.equal(run.decision?.outcome, "reject");
  assert.ok(run.decision?.reasons.includes("not a document we can process"));
});

test("a held line holds the run", async () => {
  const run = await processDocument(vagueLineDoc(), happyDeps());
  assert.equal(run.decision?.outcome, "review");
  assert.ok(run.decision?.reasons.includes("line 1 needs a person"));
});

test("all-resolved lines auto-post with no judge call", async () => {
  const deps = happyDeps({ judge: throwingJudge() });
  const run = await processDocument(cleanDoc(), deps);
  assert.equal(run.decision?.outcome, "auto");
  assert.ok((await deps.log.read()).every((e) => e.event !== "judge.called"));
});

test("a disagreement between the two reads holds", async () => {
  const run = await processDocument(letterheadDoc(), happyDeps());
  assert.equal(run.decision?.outcome, "review");
  assert.ok(run.decision?.reasons.includes("extractor and identity read disagree"));
});

test("an ambiguous customer holds", async () => {
  const run = await processDocument(ambiguousCustomerDoc(), happyDeps());
  assert.equal(run.decision?.outcome, "review");
  assert.ok(run.decision?.reasons.includes("ambiguous customer"));
});

test("freight-only lines reject rather than post empty", async () => {
  const run = await processDocument(freightOnlyDoc(), happyDeps());
  assert.equal(run.decision?.outcome, "reject");
  assert.ok(run.decision?.reasons.includes("no matchable lines"));
});

test("a credit warning informs without blocking", async () => {
  const run = await processDocument(overLimitDoc(), happyDeps());
  assert.equal(run.decision?.outcome, "auto");
  assert.ok(run.decision?.reasons.includes("over credit limit"));
});

test("a configured judge runs once on a held run and its fields survive the projection", async () => {
  const judge = {
    merge: async () => ({
      fields: { company: "Rata Design", purchaseOrder: "PO-1042" },
      evidence: [{ field: "field:company", value: "Rata Design", source: "agent:merge" }],
    }),
  };
  const deps = happyDeps({ judge });
  const run = await processDocument(vagueLineDoc(), deps);
  assert.equal(run.decision?.outcome, "review");
  assert.equal(run.extracted?.fields.company, "Rata Design");
  assert.ok((await deps.log.read()).some((event) => event.event === "judge.called"));
  const [rebuilt] = rebuildRuns(await deps.log.read());
  assert.equal(rebuilt?.extracted?.fields.company, "Rata Design");
  assert.ok(rebuilt?.decision?.evidence.some((entry) => entry.source === "agent:merge"));
});
