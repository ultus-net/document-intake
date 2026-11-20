import test from "node:test";
import assert from "node:assert/strict";
import { startDemo } from "./helpers.js";

async function onDemo(port, body) {
  const demo = await startDemo(port);
  try {
    await body(demo);
  } finally {
    await demo.stop();
  }
}

async function held(demo, document) {
  const runs = await demo.json("/api/runs");
  const run = runs.find((candidate) => candidate.document === document && !candidate.duplicate);
  assert.ok(run, `${document} should be in the queue`);
  return run;
}

test("accept posts once and replays as a duplicate", () =>
  onDemo(4390, async (demo) => {
    const run = await held(demo, "vague-line.pdf");
    const before = await demo.recordCount();

    const response = await demo.post(`/api/runs/${run.id}/accept`, { corrections: [] });
    assert.equal(response.status, 200);
    assert.equal(await demo.recordCount(), before + 1);

    const replay = await demo.post("/api/drain");
    assert.equal(replay.status, 200);
    assert.equal(await demo.recordCount(), before + 1);
    assert.equal((await replay.json()).duplicates, 6);

    const detail = await demo.json(`/api/runs/${run.id}`);
    assert.equal(detail.stage, "post");
    assert.equal(detail.posted.lines[0].sku, "CAR-4417");
  }));

test("a correction clears the hold and posts with operator evidence", () =>
  onDemo(4391, async (demo) => {
    const run = await held(demo, "letterhead.pdf");
    const response = await demo.post(`/api/runs/${run.id}/accept`, {
      corrections: [{ field: "date", value: "2026-12-01" }],
    });
    assert.equal(response.status, 200);
    const detail = await response.json();
    assert.equal(detail.posted.fields.date, "2026-12-01");
    assert.ok(
      detail.posted.decision.evidence.some((entry) => entry.source === "operator:correction"),
    );
  }));

test("a correction with an unknown field is rejected", () =>
  onDemo(4392, async (demo) => {
    const run = await held(demo, "vague-line.pdf");
    const response = await demo.post(`/api/runs/${run.id}/accept`, {
      corrections: [{ field: "made.up", value: "x" }],
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "bad-request");
  }));

test("reject records the operator's decision and posts nothing", () =>
  onDemo(4393, async (demo) => {
    const run = await held(demo, "vague-line.pdf");
    const before = await demo.recordCount();
    const response = await demo.post(`/api/runs/${run.id}/reject`);
    assert.equal(response.status, 200);
    assert.equal(await demo.recordCount(), before);
    const detail = await demo.json(`/api/runs/${run.id}`);
    assert.equal(detail.decision.outcome, "reject");
    assert.ok(detail.decision.reasons.includes("rejected by operator"));
  }));

test("a rejected document cannot be accepted", () =>
  onDemo(4394, async (demo) => {
    const run = await held(demo, "blank.pdf");
    const response = await demo.post(`/api/runs/${run.id}/accept`, { corrections: [] });
    assert.equal(response.status, 409);
  }));
