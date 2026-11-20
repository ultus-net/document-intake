import type { Deps } from "../ports.js";
import type { PostedRecord, Run } from "../types.js";
import { IntakeError } from "../errors.js";

export async function postRecord(run: Run, deps: Deps): Promise<PostedRecord> {
  const decision = run.decision;
  if (decision === undefined) {
    throw new IntakeError("no-decision", "cannot post a run without a decision");
  }

  const evidence = new Map(decision.evidence.map((entry) => [entry.field, entry.value]));
  const fields: Record<string, unknown> = { ...(run.extracted?.fields ?? {}) };
  const account = evidence.get("customer:account");
  if (account !== undefined) fields.customer = account;

  const lines: Array<{ sku: string; quantity: number }> = [];
  for (const entry of decision.evidence) {
    const matched = /^line:(\d+):sku$/.exec(entry.field);
    if (matched === null) continue;
    const index = Number(matched[1]);
    const quantity = evidence.get(`line:${index}:quantity`);
    if (typeof quantity !== "number") {
      throw new IntakeError("no-evidence", `line ${index} has no quantity evidence`);
    }
    lines.push({ sku: String(entry.value), quantity });
  }

  for (const [name, value] of Object.entries(fields)) {
    const proven = name === "customer" ? account : evidence.get(`field:${name}`);
    if (proven !== value) {
      throw new IntakeError("no-evidence", `field ${name} has no matching evidence`);
    }
  }
  for (const [index, line] of lines.entries()) {
    if (
      evidence.get(`line:${index}:sku`) !== line.sku ||
      evidence.get(`line:${index}:quantity`) !== line.quantity
    ) {
      throw new IntakeError("no-evidence", `line ${index} has no matching evidence`);
    }
  }

  const record: PostedRecord = {
    idempotencyKey: run.key ?? run.id,
    runId: run.id,
    postedAt: deps.clock.now().toISOString(),
    fields,
    lines,
    decision,
  };
  await deps.record.append(record);
  await deps.log.append({
    runId: run.id,
    correlationId: run.correlationId,
    stage: "post",
    event: "post.written",
    summary: `posted ${lines.length} lines`,
    data: { key: record.idempotencyKey, posted: record },
  });
  return record;
}
