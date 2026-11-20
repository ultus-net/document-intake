import test from "node:test";
import assert from "node:assert/strict";
import { createQueue } from "./queue.js";

test("serialises interleaved work", async () => {
  const run = createQueue();
  const order: string[] = [];
  await Promise.all([
    run(async () => {
      order.push("a1");
      await new Promise((r) => setTimeout(r, 10));
      order.push("a2");
    }),
    run(async () => {
      order.push("b1");
      order.push("b2");
    }),
  ]);
  assert.deepEqual(order, ["a1", "a2", "b1", "b2"]);
});

test("a rejected job does not break the chain", async () => {
  const run = createQueue();
  await assert.rejects(() => run(async () => { throw new Error("boom"); }));
  assert.equal(await run(async () => "next"), "next");
});
