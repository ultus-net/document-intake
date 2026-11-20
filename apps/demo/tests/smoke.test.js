import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { outcomesOf, startDemo } from "./helpers.js";

let demo;

before(async () => {
  demo = await startDemo(4399);
});

after(async () => {
  await demo.stop();
});

test("drain produces one run per fixture outcome", async () => {
  const runs = await demo.json("/api/runs");
  assert.deepEqual(outcomesOf(runs), {
    "blank.pdf": "reject",
    "clean-order.pdf": "auto",
    "credit-warning.pdf": "auto",
    "letterhead.pdf": "review",
    "statement.pdf": "reject",
    "vague-line.pdf": "review",
  });
});

test("a credit warning informs without holding", async () => {
  const runs = await demo.json("/api/runs");
  const warning = runs.find((run) => run.document === "credit-warning.pdf");
  assert.equal(warning?.outcome, "auto");
  assert.ok(warning?.reasons.includes("over credit limit"));
});

test("the clean order posts its fields", async () => {
  const runs = await demo.json("/api/runs");
  const clean = runs.find((run) => run.document === "clean-order.pdf");
  const detail = await demo.json(`/api/runs/${clean.id}`);
  assert.equal(detail.decision.outcome, "auto");
  assert.equal(detail.posted.fields.purchaseOrder, "PO-1042");
  assert.equal(detail.posted.lines.length, 3);
});

test("a replay adds a duplicate row and no second record", async () => {
  const before = await demo.recordCount();
  const response = await demo.post("/api/drain");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.processed, 0);
  assert.equal(body.duplicates, 6);
  assert.equal(await demo.recordCount(), before);
  assert.ok(body.runs.some((run) => run.duplicate));
});
