import { watch } from "node:fs";
import { resolve } from "node:path";
import {
  createQueue,
  createTemplateExtractor,
  IntakeError,
  postRecord,
  processDocument,
  rebuildRuns,
  VERSION,
} from "@document-intake/core";
import type { Decision, Deps, Evidence, EventLog, Run, SystemOfRecord } from "@document-intake/core";
import { folderInbox } from "./folder-inbox.js";
import { JsonlEventLog } from "./jsonl-log.js";
import { JsonlRecord } from "./jsonl-record.js";
import { jsonCatalogue } from "./catalogue.js";
import { jsonCustomerDirectory } from "./customer-directory.js";
import { parseCorrections } from "./correction.js";
import type { Correction } from "./correction.js";

export interface RunSummary {
  id: string;
  document: string;
  outcome: string | undefined;
  reasons: string[];
  stage: string;
  duplicate: boolean;
  postedAt: string | undefined;
}

export interface Demo {
  version: string;
  deps: Deps;
  recordCount(): Promise<number>;
  drain(): Promise<Run[]>;
  runs(): Promise<Run[]>;
  run(id: string): Promise<Run | undefined>;
  accept(id: string, body: unknown): Promise<Run>;
  reject(id: string): Promise<Run>;
}

const clock = { now: () => new Date() };
const notifier = { notify: (message: string) => console.log(`[notify] ${message}`) };

function evidenceFor(run: Run): Evidence[] {
  return run.decision?.evidence ?? [];
}

function operatorDecision(run: Run, corrections: Correction[]): Decision {
  const original = run.decision;
  if (original === undefined) {
    throw new IntakeError("not-acceptable", "this run has no decision to accept");
  }
  const accepted: Evidence[] = original.reasons.map((reason, index) => ({
    field: `decision:${index}`,
    value: reason,
    source: "operator:accept",
    rule: "the person accepted the hold reason",
  }));
  const corrected: Evidence[] = corrections.map((correction) => ({
    field: `field:${correction.field}`,
    value: correction.value,
    source: "operator:correction",
    rule: "the person corrected the extracted value",
  }));
  return {
    outcome: "auto",
    reasons: [
      ...original.reasons.map((reason) => `accepted by operator: ${reason}`),
      ...corrections.map((correction) => `corrected ${correction.field}`),
    ],
    evidence: [...evidenceFor(run), ...accepted, ...corrected],
  };
}

function withCorrections(run: Run, corrections: Correction[]): Run {
  if (corrections.length === 0) return run;
  const extracted = run.extracted;
  if (extracted === undefined) {
    throw new IntakeError("not-acceptable", "this run has nothing extracted to correct");
  }
  const fields = { ...extracted.fields };
  for (const correction of corrections) fields[correction.field] = correction.value;
  return { ...run, extracted: { ...extracted, fields } };
}

export async function createDemo(): Promise<Demo> {
  const fixtures = resolve(process.env.INTAKE_FIXTURES ?? "fixtures/documents");
  const stateDir = resolve(process.env.INTAKE_STATE_DIR ?? "var");
  const fresh = process.argv.includes("--fresh");

  const log: EventLog = await JsonlEventLog.open(`${stateDir}/events.jsonl`, clock, fresh);
  const record: SystemOfRecord = await JsonlRecord.open(`${stateDir}/records.jsonl`, fresh);

  const deps: Deps = {
    inbox: folderInbox(fixtures),
    extractor: createTemplateExtractor(),
    catalogue: await jsonCatalogue(resolve("fixtures/catalogue.json")),
    directory: await jsonCustomerDirectory(resolve("fixtures/customers.json")),
    record,
    notifier,
    clock,
    log,
  };

  const queue = createQueue();
  const rebuild = async (): Promise<Run[]> => rebuildRuns(await log.read());

  async function drain(): Promise<Run[]> {
    const documents = await deps.inbox.list();
    const runs: Run[] = [];
    for (const document of documents) {
      runs.push(await processDocument(document, deps));
    }
    return runs;
  }

  const demo: Demo = {
    version: VERSION,
    deps,
    async recordCount() {
      return (await record.list()).length;
    },
    drain: () => queue(drain),
    runs: () => queue(rebuild),
    async run(id) {
      return (await queue(rebuild)).find((run) => run.id === id);
    },
    accept: (id, body) =>
      queue(async () => {
        const run = (await rebuild()).find((candidate) => candidate.id === id);
        if (run === undefined) throw new IntakeError("not-found", `no run ${id}`);
        if (run.posted !== undefined) return run;
        if (run.decision?.outcome !== "review") {
          throw new IntakeError("not-acceptable", "only a held run can be accepted");
        }
        const allowed = Object.keys(run.extracted?.fields ?? {});
        const corrections = parseCorrections(body, allowed);
        const corrected = withCorrections(run, corrections);
        const decision = operatorDecision(corrected, corrections);
        await log.append({
          runId: corrected.id,
          correlationId: corrected.correlationId,
          stage: "decide",
          event: "decide.accept",
          summary: decision.reasons.join("; "),
          data: { decision },
        });
        const accepted = { ...corrected, decision };
        const posted = await postRecord(accepted, deps);
        return { ...accepted, stage: "post", posted };
      }),
    reject: (id) =>
      queue(async () => {
        const run = (await rebuild()).find((candidate) => candidate.id === id);
        if (run === undefined) throw new IntakeError("not-found", `no run ${id}`);
        if (run.posted !== undefined) return run;
        const decision: Decision = {
          outcome: "reject",
          reasons: ["rejected by operator", ...(run.decision?.reasons ?? [])],
          evidence: [
            ...evidenceFor(run),
            { field: "decision:reject", value: "rejected", source: "operator:reject" },
          ],
        };
        await log.append({
          runId: run.id,
          correlationId: run.correlationId,
          stage: "decide",
          event: "decide.reject",
          summary: decision.reasons.join("; "),
          data: { decision },
        });
        return { ...run, decision };
      }),
  };

  await demo.drain();

  const watcher = watch(fixtures, { persistent: false }, () => {
    setTimeout(() => void demo.drain().catch((error: unknown) => console.error(error)), 250);
  });
  watcher.unref();

  return demo;
}

let singleton: Promise<Demo> | undefined;

export function getDemo(): Promise<Demo> {
  singleton ??= createDemo();
  return singleton;
}

export function summarise(run: Run): RunSummary {
  return {
    id: run.id,
    document: run.document?.filename ?? "(unknown)",
    outcome: run.decision?.outcome,
    reasons: run.decision?.reasons ?? [],
    stage: run.stage,
    duplicate: run.duplicate === true,
    postedAt: run.posted?.postedAt,
  };
}
