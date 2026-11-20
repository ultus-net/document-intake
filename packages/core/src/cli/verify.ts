import { readFile } from "node:fs/promises";
import { verifyAll } from "../verify.js";
import type { Event } from "../types.js";
import type { PostedRecord } from "../types.js";

const dir = process.env.INTAKE_STATE_DIR ?? "var";

async function lines<T>(file: string): Promise<T[]> {
  const text = await readFile(`${dir}/${file}`, "utf8").catch(() => "");
  return text.split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line) as T);
}

const events = await lines<Event>("events.jsonl");
const records = await lines<PostedRecord>("records.jsonl");

const results = await verifyAll(
  {
    log: {
      append: async () => { throw new Error("read-only"); },
      read: async () => events,
    },
    record: {
      find: async (key) => records.find((record) => record.idempotencyKey === key),
      append: async () => { throw new Error("read-only"); },
      list: async () => records,
    },
    clock: { now: () => new Date() },
  },
  0,
);

if (results.length === 0) console.log("no posted records to verify");
for (const result of results) {
  console.log(`${result.status.padEnd(7)} ${result.runId}  ${result.detail}`);
}
