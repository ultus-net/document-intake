import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { startDemo } from "./helpers.js";

let demo;

before(async () => {
  demo = await startDemo(4389);
});

after(async () => {
  await demo.stop();
});

async function runFor(document) {
  const runs = await demo.json("/api/runs");
  const run = runs.find((candidate) => candidate.document === document && !candidate.duplicate);
  assert.ok(run, `${document} should be in the queue`);
  return run;
}

test("the queue renders a held run with its reason", async () => {
  const html = await demo.get("/");
  assert.match(html, /Review queue/);
  assert.match(html, /line 1 needs a person/);
  assert.match(html, /audit/);
});

test("run detail shows the short-circuit as zero model calls", async () => {
  const run = await runFor("clean-order.pdf");
  const html = await demo.get(`/run/${run.id}`);
  assert.match(html, /no model calls/i);
  assert.match(html, /PO-1042/);
});

test("a held run offers accept, correct and reject", async () => {
  const run = await runFor("vague-line.pdf");
  const html = await demo.get(`/run/${run.id}`);
  assert.match(html, /Accept as is/);
  assert.match(html, /Correct and accept/);
  assert.match(html, /Reject/);
});

test("a rejected run shows its plain reason", async () => {
  const run = await runFor("blank.pdf");
  const html = await demo.get(`/run/${run.id}`);
  assert.match(html, /could not read the document/);
});
