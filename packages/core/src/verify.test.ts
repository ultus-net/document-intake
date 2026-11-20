import test from "node:test";
import assert from "node:assert/strict";
import { verifyAll } from "./verify.js";
import { processDocument } from "./pipeline.js";
import { cleanDoc, happyDeps, memoryRecord, scanDoc, vagueLineDoc } from "./fakes.js";

test("verify reports drift for the latest revision of a key", async () => {
  const deps = happyDeps();
  await processDocument(cleanDoc(), deps);
  const [record] = await deps.record.list();
  assert.ok(record);
  await deps.record.append({
    ...record,
    fields: { ...record.fields, purchaseOrder: "WRONG" },
  });
  const results = await verifyAll(deps, 0);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.status, "drift");
});

test("verify reports a missing record", async () => {
  const record = memoryRecord();
  const deps = happyDeps({ record });
  await processDocument(cleanDoc(), deps);
  record.clear();
  const [result] = await verifyAll(deps, 0);
  assert.equal(result?.status, "missing");
});

test("verify reports ok when the record is unchanged", async () => {
  const deps = happyDeps();
  await processDocument(cleanDoc(), deps);
  const [result] = await verifyAll(deps, 0);
  assert.equal(result?.status, "ok");
});

test("verify reports only records that posted", async () => {
  const deps = happyDeps();
  await processDocument(cleanDoc(), deps);
  await processDocument(vagueLineDoc(), deps);
  await processDocument(scanDoc(), deps);
  const results = await verifyAll(deps, 0);
  assert.deepEqual(
    results.map((result) => result.status),
    ["ok"],
  );
});
