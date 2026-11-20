# document-intake Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, runnable TypeScript template that takes a document from an inbox to a system of record, holding anything uncertain for a person, with an evidence trail for every field.

**Architecture:** `packages/core` is a pure library: ports, stages, gates, matching, event log, run projection and verification, with in-memory fakes and no I/O. `apps/demo` is a SvelteKit app that wires folder and JSONL adapters into core and renders the review queue. `fixtures/` holds six synthetic documents, one per outcome.

**Tech Stack:** Node 22, TypeScript strict, npm workspaces, `node:test`, `pdfjs-dist` (pinned), `pdf-lib` (fixtures only, pinned), SvelteKit with `adapter-node`, `svelte-check`.

**Spec:** `docs/superpowers/specs/2026-11-20-template-design.md`

## Global Constraints

- Node 22, enforced by `engines` and `.nvmrc`. TypeScript strict, ESM, `NodeNext`.
- `packages/core` runtime dependency is `pdfjs-dist` and nothing else, pinned exact.
  Any other dependency needs a one-line justification in the PR.
- Every dependency is pinned exact and `package-lock.json` is committed, because CI
  runs `npm ci`. `packageManager` names the npm version.
- `npm ci` is the only step that needs the network. Everything after it runs offline.
- `npm run check` is the gate: lint, typecheck, Svelte check, tests. `npm run verify`
  is the delayed record-verification pass. The two names never swap.
- Tests are `node:test`. Core tests compile first and run `node --test dist`.
- No client identifier in code, fixtures, docs, or commit history. The term list
  lives in the operator's notes, never in this repo.
- The demo is single-process. Every ingest, accept and append runs through one
  in-process queue. No file locks.
- Matching thresholds: `>= 0.82` accept, `0.55 .. 0.82` hold, `< 0.55` reject.
- Idempotency key: `sha256(len(messageId) + ":" + messageId + bytes)`, hex.
- Event `ts` is ISO-8601 UTC. Generated state lives under `var/`, gitignored,
  overridable with `INTAKE_STATE_DIR`.
- System font stack only. No vendored or downloaded fonts.
- Licence MIT, `CHANGELOG.md` from the first commit.

## Review Focus

- A non-PDF file (`.docx`, `.png`) lands in the inbox. Expect `reject` with a plain
  reason, never a crash or a stack trace in the UI.
- A corrupt PDF lands in the inbox. Expect `reject`, never an unhandled parser throw.
- A PDF with no extractable text (a scan) arrives. Expect `reject`, reason
  `could not read the document`, matching the design's validity gate.
- The same message is delivered twice. Expect one record or one held run, and an
  `ingest.duplicate` event, including for held and rejected documents.
- A document whose lines are all freight or fee rows. Expect `reject` with reason
  `no matchable lines`, not a zero-line post.
- Two customers share a normalised name. Expect `review` with `ambiguous customer`,
  never the first match.

---

### Task 1: Workspace, pinned dependencies, gates, and CI

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `eslint.config.mjs`, `.gitignore`, `.nvmrc`, `LICENSE`, `CHANGELOG.md`, `.github/workflows/ci.yml`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`, `packages/core/src/index.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `VERSION: string` from `@document-intake/core`. Root scripts `build`, `check`, `lint`, `typecheck`, `test`, `verify`, `demo`, `fixtures`.

- [ ] **Step 1: Create the workspace files**

Root `package.json`: `"private": true`, `"type": "module"`, `"workspaces": ["packages/*", "apps/*"]`, `"engines": {"node": ">=22"}`, `"packageManager": "npm@11.20.0"`. Scripts:

```json
{
  "build": "npm run build -w @document-intake/core && npm run build -w @document-intake/demo",
  "lint": "eslint .",
  "typecheck": "npm run typecheck -w @document-intake/core && npm run typecheck -w @document-intake/demo",
  "test": "npm run test -w @document-intake/core && npm run test -w @document-intake/demo",
  "check": "npm run lint && npm run build && npm run typecheck && npm run test",
  "verify": "npm run build -w @document-intake/core && node packages/core/dist/cli/verify.js",
  "fixtures": "node scripts/make-fixtures.mjs",
  "demo": "npm run build && HOST=127.0.0.1 PORT=${DEMO_PORT:-4321} node apps/demo/build/index.js"
}
```

The workspace order is explicit because npm does not topologically sort workspaces: the demo needs
core's `dist` before it builds or type-checks. `check` builds before it type-checks for the same
reason.

`tsconfig.base.json`: `target` `ES2022`, `module` `NodeNext`, `moduleResolution` `NodeNext`, `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `outDir` `dist`, `rootDir` `src`, `declaration`.

`packages/core/package.json`: name `@document-intake/core`, `"type": "module"`, `"exports": {".": "./dist/index.js"}`, `"types": "./dist/index.d.ts"`, `dependencies` `{"pdfjs-dist": "6.5.438"}`, devDependencies `typescript` pinned. Scripts `build`, `typecheck`, `test` = `npm run build && node --test dist`.

`eslint.config.mjs`: flat config with pinned `typescript-eslint`, ignoring `dist`, `build`, `.svelte-kit`, `node_modules`, `var`, and `*.svelte`. Svelte files are type-checked by `svelte-check` in Task 10, so the lint gate stays dependency-light.

`.gitignore`: `node_modules/`, `dist/`, `build/`, `.svelte-kit/`, `var/`, `.env`.
`.nvmrc`: `22`. `LICENSE`: MIT, `Copyright (c) 2026 ultus-net`.
`CHANGELOG.md`: `# Changelog`, then `## 0.1.0 (unreleased)`.

`.github/workflows/ci.yml`: on push and pull_request, Node 22 from `.nvmrc`, `npm ci`, `npm run build`, `npm run check`, then `node --test apps/demo/tests/smoke.test.js`.

- [ ] **Step 2: Write the failing smoke test**

`packages/core/src/index.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { VERSION } from "./index.js";

test("exports a version", () => assert.equal(VERSION, "0.1.0"));
```

- [ ] **Step 3: Run it to see it fail**

Run: `npm test -w @document-intake/core`
Expected: FAIL, `Cannot find module './index.js'` or a missing export.

- [ ] **Step 4: Add the export**

`packages/core/src/index.ts`: `export const VERSION = "0.1.0";`

- [ ] **Step 5: Run the gates and commit**

Run: `npm run check`
Expected: lint, typecheck and all tests pass.

```bash
git add -A
git commit -m "chore: scaffold the workspace, pinned deps, and its gates"
```

---

### Task 2: Types, errors, the event log, and the serial queue

**Files:**
- Create: `packages/core/src/types.ts`, `packages/core/src/errors.ts`, `packages/core/src/events.ts`, `packages/core/src/queue.ts`, `packages/core/src/fakes.ts`, `packages/core/src/events.test.ts`, `packages/core/src/queue.test.ts`

**Interfaces:**
- Consumes: `Clock` declared in `types.ts`.
- Produces: `Outcome`, `Stage`, `Evidence`, `Decision`, `Event`, `EventLog`, `MemoryEventLog`, `IntakeError`, `PostedRecord`, `Run`, `createQueue(): <T>(fn: () => Promise<T>) => Promise<T>`, `fixedClock(iso: string): Clock`.

- [ ] **Step 1: Write the failing tests**

`events.test.ts`:

```ts
test("assigns monotonic seq and clock timestamps", async () => {
  const log = new MemoryEventLog(fixedClock("2026-01-02T03:04:05Z"));
  await log.append({ runId: "r1", correlationId: "c1", stage: "ingest",
    event: "ingest.accepted", summary: "one document" });
  const second = await log.append({ runId: "r1", correlationId: "c1",
    stage: "extract", event: "extract.complete", summary: "3 fields" });
  assert.equal(second.seq, 1);
  assert.equal(second.ts, "2026-01-02T03:04:05.000Z");
  assert.deepEqual((await log.read()).map((e) => e.event),
    ["ingest.accepted", "extract.complete"]);
});
```

`queue.test.ts`:

```ts
test("serialises interleaved work", async () => {
  const run = createQueue();
  const order: string[] = [];
  await Promise.all([
    run(async () => { order.push("a1"); await new Promise((r) => setTimeout(r, 10)); order.push("a2"); }),
    run(async () => { order.push("b1"); order.push("b2"); }),
  ]);
  assert.deepEqual(order, ["a1", "a2", "b1", "b2"]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -w @document-intake/core`
Expected: FAIL, `./events.js` and `./queue.js` not found.

- [ ] **Step 3: Implement**

`types.ts` carries the spec's types plus:

```ts
export interface Clock { now(): Date; }
export interface DocumentRef { messageId: string; filename: string; receivedAt: string; }
export interface SourceDocument extends DocumentRef { bytes: Uint8Array; }
export interface LineItem {
  description: string; quantity: number; unitPrice?: number; lineTotal?: number;
}
export interface ExtractedDocument {
  status: "ok" | "unreadable" | "not-a-document";
  fields: Record<string, string>;
  identity: Record<string, string>;   // the independent second read
  lines: LineItem[];
}
export interface EventInput {
  runId: string; correlationId: string; stage: Stage; event: string;
  summary: string; data?: Record<string, unknown>;
}
export interface PostedRecord {
  idempotencyKey: string; runId: string; postedAt: string;
  fields: Record<string, unknown>;
  lines: Array<{ sku: string; quantity: number }>;
  decision: Decision;
}
export interface Run {
  id: string; correlationId: string; stage: Stage;
  document?: DocumentRef; extracted?: ExtractedDocument;
  decision?: Decision; duplicate?: boolean; posted?: PostedRecord;
}
```

`errors.ts`: `IntakeError` with `readonly code: string` and `name = "IntakeError"`.
`events.ts`: `MemoryEventLog` with `append`, `read`, `entries`; `seq` from 0; `ts` from the clock.
`queue.ts`: `createQueue()` chains each call onto a stored promise, so a rejection does not break the chain.
`fakes.ts`: `fixedClock`, plus in-memory ports added in Task 3.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -w @document-intake/core`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat: add core types, event log, typed errors, and the serial queue"
```

---

### Task 3: Matching and the port contracts

**Files:**
- Create: `packages/core/src/matching.ts`, `packages/core/src/matching.test.ts`, `packages/core/src/ports.ts`

**Interfaces:**
- Consumes: `Clock` and `EventLog` from `types.ts`.
- Produces: `normalise(text: string): string`, `trigramScore(a: string, b: string): number`, `classify(score: number, exactReference: boolean): "accept" | "hold" | "reject"`, `THRESHOLDS`, `Inbox`, `Extractor`, `Catalogue`, `CustomerDirectory`, `SystemOfRecord`, `Notifier`, `EventLog`, `Judge`, `Deps`.

- [ ] **Step 1: Write the failing test**

```ts
test("normalise folds case, accents and punctuation", () => {
  assert.equal(normalise("Kōwhai  Weave, 4417"), "kowhai weave 4417");
});
test("identical names score 1", () => {
  assert.equal(trigramScore("aurelia weave", "aurelia weave"), 1);
});
test("classify honours the spec thresholds", () => {
  assert.equal(classify(0.82, false), "accept");
  assert.equal(classify(0.819, false), "hold");
  assert.equal(classify(0.55, false), "hold");
  assert.equal(classify(0.549, false), "reject");
  assert.equal(classify(0.1, true), "accept");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -w @document-intake/core`
Expected: FAIL, `normalise is not a function`.

- [ ] **Step 3: Implement**

`normalise`: `NFKD`, strip combining marks, lowercase, replace runs of non `[a-z0-9]` with one space, trim. `trigramScore`: Jaccard over 3-character substring sets. `THRESHOLDS = { accept: 0.82, hold: 0.55 } as const`.

`ports.ts` declares:

```ts
export interface Inbox { list(): Promise<SourceDocument[]>; }
export interface Extractor { extract(doc: SourceDocument): Promise<ExtractedDocument>; }
export interface MatchResult { sku?: string; score: number; exactReference: boolean; rule: string; }
export interface Catalogue { match(description: string): Promise<MatchResult>; }
export interface ResolvedCustomer {
  account?: string; score: number; ambiguous: boolean;
  creditLimitCents?: number; openBalanceCents?: number;
}
export interface CustomerDirectory {
  resolve(doc: SourceDocument, fields: Record<string, string>, identity: Record<string, string>): Promise<ResolvedCustomer>;
}
export interface SystemOfRecord {
  find(key: string): Promise<PostedRecord | undefined>;
  append(record: PostedRecord): Promise<void>;
  list(): Promise<PostedRecord[]>;          // may hold several revisions per key
}
export interface Notifier { notify(message: string): void; }
export interface EventLog {
  append(input: EventInput): Promise<Event>;
  read(): Promise<Event[]>;
}
export interface Judge {
  merge(input: { fields: Record<string, string>; reasons: string[] }): Promise<{
    fields: Record<string, string>; evidence: Evidence[];
  }>;
}
export interface Deps {
  inbox: Inbox; extractor: Extractor; catalogue: Catalogue;
  directory: CustomerDirectory; record: SystemOfRecord;
  notifier: Notifier; clock: Clock; log: EventLog; judge?: Judge;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -w @document-intake/core`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat: add trigram matching and the port contracts"
```

---

### Task 4: Ingest, idempotency, and the ingestion index

**Files:**
- Create: `packages/core/src/idempotency.ts`, `packages/core/src/pipeline.ts`, `packages/core/src/pipeline.test.ts`, `packages/core/src/fakes.ts` (extend)

**Interfaces:**
- Consumes: `Deps`, `SourceDocument`, `EventLog`.
- Produces: `idempotencyKey(doc: { messageId: string; bytes: Uint8Array }): string`, `processDocument(doc: SourceDocument, deps: Deps): Promise<Run>`.

- [ ] **Step 1: Write the failing tests**

```ts
test("the same message twice yields one run and a duplicate event", async () => {
  const deps = happyDeps();
  const first = await processDocument(cleanDoc(), deps);
  const second = await processDocument(cleanDoc(), deps);
  assert.equal(first.duplicate, undefined);
  assert.equal(second.duplicate, true);
  assert.equal((await deps.log.read()).filter((e) => e.event === "ingest.accepted").length, 1);
  assert.ok((await deps.log.read()).some((e) => e.event === "ingest.duplicate"));
});
test("a held document is not re-run", async () => {
  const deps = happyDeps();
  await processDocument(vagueLineDoc(), deps);   // ends held, nothing posted
  assert.equal((await processDocument(vagueLineDoc(), deps)).duplicate, true);
});
test("the length prefix prevents key collisions", () => {
  const a = idempotencyKey({ messageId: "ab", bytes: utf8("c") });
  const b = idempotencyKey({ messageId: "a", bytes: utf8("bc") });
  assert.notEqual(a, b);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -w @document-intake/core`
Expected: FAIL, `processDocument is not a function`.

- [ ] **Step 3: Implement**

`idempotency.ts` hashes the decimal length of the messageId, a colon, the messageId, then the bytes, with `node:crypto` `createHash("sha256")`, hex.

`pipeline.ts` computes the key, then treats it as duplicate when `deps.record.find(key)` resolves or when `deps.log.read()` holds an `ingest.accepted` event whose `data.key` equals it. Duplicate emits `ingest.duplicate` and returns `{ ...run, duplicate: true }`. Otherwise emits `ingest.accepted` with `data.key`, attaches the document, and continues into the stages from Task 5.

`fakes.ts` gains in-memory implementations of every port, plus `happyDeps()` and the document builders (`cleanDoc`, `vagueLineDoc`, `scanDoc`, `freightOnlyDoc`, `ambiguousCustomerDoc`, `overLimitDoc`, `letterheadDoc`). `memoryRecord` exposes `clear()` for the verification test.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -w @document-intake/core`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat: add ingest, the ingestion index, and idempotent duplicates"
```

---

### Task 5: Resolve, decide, and the gates

**Files:**
- Create: `packages/core/src/stages/resolve.ts`, `packages/core/src/stages/decide.ts`, `packages/core/src/stages/resolve.test.ts`, `packages/core/src/pipeline.test.ts` (extend)

**Interfaces:**
- Consumes: `Catalogue.match`, `CustomerDirectory.resolve`, `classify`, `Judge`.
- Produces: `resolveLines(lines: LineItem[], catalogue: Catalogue): Promise<ResolvedLine[]>`, `ResolvedLine { line: LineItem; sku?: string; score: number; rule: string; }`, `decide(input: DecideInput): Decision`.

- [ ] **Step 1: Write the failing tests**

```ts
test("an unreadable document rejects with a plain reason", async () => {
  const run = await processDocument(scanDoc(), happyDeps());
  assert.equal(run.decision?.outcome, "reject");
  assert.ok(run.decision!.reasons.includes("could not read the document"));
});
test("a non-document rejects", async () => {
  const run = await processDocument(statementDoc(), happyDeps());
  assert.equal(run.decision?.outcome, "reject");
  assert.ok(run.decision!.reasons.includes("not a document we can process"));
});
test("a held line holds the run", async () => {
  const run = await processDocument(vagueLineDoc(), happyDeps());
  assert.equal(run.decision?.outcome, "review");
  assert.ok(run.decision!.reasons.includes("line 1 needs a person"));
});
test("all-resolved lines auto-post with no judge call", async () => {
  const judge = { merge: () => { throw new Error("judge must not run"); } };
  const deps = happyDeps({ judge });
  const run = await processDocument(cleanDoc(), deps);
  assert.equal(run.decision?.outcome, "auto");
  assert.ok((await deps.log.read()).every((e) => e.event !== "judge.called"));
});
test("a disagreement between the two reads holds", async () => {
  const run = await processDocument(letterheadDoc(), happyDeps());
  assert.equal(run.decision?.outcome, "review");
  assert.ok(run.decision!.reasons.includes("extractor and identity read disagree"));
});
test("an ambiguous customer holds", async () => {
  const run = await processDocument(ambiguousCustomerDoc(), happyDeps());
  assert.equal(run.decision?.outcome, "review");
  assert.ok(run.decision!.reasons.includes("ambiguous customer"));
});
test("freight-only lines reject rather than post empty", async () => {
  const run = await processDocument(freightOnlyDoc(), happyDeps());
  assert.equal(run.decision?.outcome, "reject");
  assert.ok(run.decision!.reasons.includes("no matchable lines"));
});
test("a credit warning informs without blocking", async () => {
  const run = await processDocument(overLimitDoc(), happyDeps());
  assert.equal(run.decision?.outcome, "auto");
  assert.ok(run.decision!.reasons.includes("over credit limit"));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -w @document-intake/core`
Expected: FAIL on the first new test.

- [ ] **Step 3: Implement**

`resolve.ts` removes service rows by name (`freight`, `delivery`, `fee`, `surcharge`, `note`), matches the rest, and returns them tagged with `classify(...)` as the rule.

`decide.ts` runs the gates in this order, appending fixed reason strings: extractor status, empty matchable set, held or rejected lines, extractor and identity disagreement, customer ambiguity, then credit. Credit adds `over credit limit` and never blocks. When a line is held and `deps.judge` exists, call it once, emit `judge.called`, and merge its fields and evidence. `auto` emits `decide.shortcircuit` with `data.modelCalls = 0`; every other path emits `decide.hold` or `decide.reject`.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -w @document-intake/core`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat: add resolution, the gates, and the short-circuit"
```

---

### Task 6: Post, the evidence invariant, and verification

**Files:**
- Create: `packages/core/src/stages/post.ts`, `packages/core/src/verify.ts`, `packages/core/src/post.test.ts`, `packages/core/src/verify.test.ts`, `packages/core/src/cli/verify.ts`

**Interfaces:**
- Consumes: `SystemOfRecord`, `Clock`, `EventLog`.
- Produces: `postRecord(run: Run, deps: Deps): Promise<PostedRecord>`, `verifyAll(deps: Deps, olderThanHours: number): Promise<VerifyResult[]>`, `VerifyResult { key: string; runId: string; status: "ok" | "missing" | "drift"; detail: string }`.

- [ ] **Step 1: Write the failing tests**

```ts
test("the clean order's event trail is stable", async () => {
  const deps = happyDeps();
  await processDocument(cleanDoc(), deps);
  assert.deepEqual((await deps.log.read()).map((e) => e.event), [
    "ingest.accepted", "extract.complete", "resolve.lines",
    "decide.shortcircuit", "post.written",
  ]);
});
test("one document yields one posted record", async () => {
  const deps = happyDeps();
  await processDocument(cleanDoc(), deps);
  await processDocument(cleanDoc(), deps);
  assert.equal((await deps.record.list()).length, 1);
});
test("post refuses a value with no matching evidence", async () => {
  await assert.rejects(
    () => postRecord(runWithStaleEvidence(), happyDeps()),
    (e: unknown) => e instanceof IntakeError && e.code === "no-evidence",
  );
});
test("verify reports drift for the latest revision of a key", async () => {
  const deps = happyDeps();
  await processDocument(cleanDoc(), deps);
  const [record] = await deps.record.list();
  await deps.record.append({ ...record!, fields: { ...record!.fields, purchaseOrder: "WRONG" } });
  const results = await verifyAll(deps, 0);
  assert.equal(results.length, 1);
  assert.equal(results[0]!.status, "drift");
});
test("verify reports a missing record", async () => {
  const deps = happyDeps();
  await processDocument(cleanDoc(), deps);
  await deps.record.clear();
  const [result] = await verifyAll(deps, 0);
  assert.equal(result!.status, "missing");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -w @document-intake/core`
Expected: FAIL, `postRecord is not a function`.

- [ ] **Step 3: Implement**

`post.ts` builds one evidence entry per posted value, keyed by path: every field as `field:<name>`, every line as `line:<index>:sku` and `line:<index>:quantity`. It then asserts each posted value has an evidence entry with the same value, throwing `IntakeError("no-evidence", ...)` otherwise. Operator corrections are evidence with `source: "operator:correction"`. On success it appends and emits `post.written`.

`verify.ts` reads the `post.written` keys and timestamps from the event log, selects the keys older than the threshold, and compares each against the latest revision in the store. So `missing` means the log says it posted and the store no longer holds it, which is the case that matters. A differing field is `drift`; otherwise `ok`. `cli/verify.ts` prints the table.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -w @document-intake/core && npm run verify`
Expected: all tests pass, the CLI prints an empty table.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat: post with an evidence invariant and verify after posting"
```

---

### Task 7: The run projection

**Files:**
- Create: `packages/core/src/projection.ts`, `packages/core/src/projection.test.ts`

**Interfaces:**
- Consumes: `Event[]`.
- Produces: `rebuildRuns(events: Event[]): Run[]`, keyed by runId, latest state wins. Used by the UI and by accept after a restart.

- [ ] **Step 1: Write the failing test**

```ts
test("rebuilds a held run from events alone", async () => {
  const deps = happyDeps();
  const run = await processDocument(vagueLineDoc(), deps);
  const [rebuilt] = rebuildRuns(await deps.log.read());
  assert.equal(rebuilt!.id, run.id);
  assert.equal(rebuilt!.decision?.outcome, "review");
  assert.equal(rebuilt!.extracted?.lines.length, 1);
  assert.equal(rebuilt!.stage, "decide");
});
test("a second event payload supersedes the first", async () => {
  const log = new MemoryEventLog(fixedClock("2026-01-01T00:00:00Z"));
  await log.append({ runId: "r", correlationId: "c", stage: "decide",
    event: "decide.hold", summary: "held", data: { outcome: "review" } });
  await log.append({ runId: "r", correlationId: "c", stage: "post",
    event: "post.written", summary: "posted", data: { posted: true } });
  const [run] = rebuildRuns(await log.read());
  assert.equal(run!.stage, "post");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -w @document-intake/core`
Expected: FAIL, `rebuildRuns is not a function`.

- [ ] **Step 3: Implement**

Every stage event the projection consumes carries its result in `data` under a fixed name:
`document`, `extracted`, `decision`, `posted`. `document` is its `DocumentRef`, never the bytes,
because the log is JSON. `resolve.lines` stays in the log as audit detail but is not folded: the
decision's evidence already carries each matched sku and quantity, which is what the accept path and
the posted record need. `rebuildRuns` folds the consumed payloads in order by `runId`.

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -w @document-intake/core`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat: rebuild runs from the event log"
```

---

### Task 8: The template extractor, the identity read, and the fixtures

**Files:**
- Create: `scripts/make-fixtures.mjs`, `packages/core/src/extract/template-extractor.ts`, `packages/core/src/extract/identity.ts`, `packages/core/src/extract/template-extractor.test.ts`
- Create: `fixtures/documents/{clean-order,letterhead,vague-line,statement,credit-warning,blank}.pdf`, `fixtures/catalogue.json`, `fixtures/customers.json`

**Interfaces:**
- Consumes: `Extractor`, `ExtractedDocument`, `SourceDocument`.
- Produces: `createTemplateExtractor(): Extractor`, `readIdentity(text: string): Record<string, string>`.

- [ ] **Step 1: Write the fixture generator**

`scripts/make-fixtures.mjs` is plain ESM JavaScript so it needs no build step. It uses `pdf-lib` (devDependency, pinned; justification: it renders the six sample documents and nothing else) and writes six A4 PDFs for the fictional distributor "Northgate Interiors":

| File | Content |
|---|---|
| `clean-order.pdf` | header fields, three catalogue lines |
| `letterhead.pdf` | our letterhead at the top, sender email of the customer in the body |
| `vague-line.pdf` | header fields, one line reading `Aurelia weave` |
| `statement.pdf` | an account statement, no order fields |
| `credit-warning.pdf` | two large lines, above the customer's limit |
| `blank.pdf` | a rectangle, no text layer |

It also writes `catalogue.json` (six products with `sku`, `name`, `manufacturerRef`) and `customers.json` (four companies; one ambiguous name pair, one with a low credit limit). Commit the PDFs so a clone needs no regeneration. Run: `npm run fixtures`.

- [ ] **Step 2: Write the failing extractor tests**

```ts
test("reads the clean order", async () => {
  const out = await extractor().extract(await pdf("clean-order"));
  assert.equal(out.status, "ok");
  assert.equal(out.fields.purchaseOrder, "PO-1042");
  assert.equal(out.lines.length, 3);
});
test("the identity read disagrees on letterhead", async () => {
  const out = await extractor().extract(await pdf("letterhead"));
  assert.equal(out.fields.company.toLowerCase(), "northgate interiors");
  assert.match(out.identity.email ?? "", /buyer@/);
});
test("a statement is not a document", async () => {
  assert.equal((await extract("statement")).status, "not-a-document");
});
test("a non-PDF is not a document", async () => {
  assert.equal((await extractor().extract(docxLike())).status, "not-a-document");
});
test("a PDF with no text is unreadable", async () => {
  assert.equal((await extract("blank")).status, "unreadable");
});
test("a corrupt PDF is unreadable, not a crash", async () => {
  assert.equal((await extractor().extract(corruptPdf())).status, "unreadable");
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npm test -w @document-intake/core`
Expected: FAIL, the extractor module is missing.

- [ ] **Step 4: Implement**

`template-extractor.ts` calls `getDocument({ data }).promise`, collects `getTextContent()` per page, and joins the text. It applies labelled-field rules (`Purchase order`, `Date`, `Deliver to`) and a line rule reading `description  qty  unit  total`. It returns `not-a-document` when no order fields and no lines are found, `unreadable` when the text layer is empty or the parser throws, and never leaks a parser exception to the pipeline. It then calls `readIdentity(text)`.

`identity.ts` is the second, independent read: it returns the company, email and phone printed in the document body, using different rules from the header parser, so a supplier letterhead and a customer sender produce a disagreement rather than the same wrong answer. `decide` holds on that disagreement.

- [ ] **Step 5: Run them to see them pass**

Run: `npm run fixtures && npm run check`
Expected: all tests pass and six PDFs list under `fixtures/documents`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add the template extractor, the identity read, and six fixtures"
```

---

### Task 9: Demo adapters, API, lifecycle, and the smoke test

**Files:**
- Create: `apps/demo/{package.json,tsconfig.json,vite.config.ts}`
- Create: `apps/demo/src/app.html`
- Create: `apps/demo/src/lib/server/{folder-inbox,jsonl-record,jsonl-log,catalogue,customer-directory,correction,http,wiring}.ts`
- Create: `apps/demo/src/routes/api/{drain,runs}/+server.ts`, `apps/demo/src/routes/api/runs/[id]/{accept,reject}/+server.ts`
- Create: `apps/demo/tests/{helpers.js,smoke.test.js,accept.test.js}`

**Interfaces:**
- Consumes: `processDocument`, `postRecord`, `rebuildRuns`, `verifyAll`, fixtures.
- Produces: the built demo server on `http://127.0.0.1:4321`; `POST /api/drain`, `GET /api/runs`, `GET /api/runs/:id`, `POST /api/runs/:id/accept`, `POST /api/runs/:id/reject`.

- [ ] **Step 1: Write the failing tests**

Plain ESM JavaScript, so the tests need no build of their own. Each spawns `node apps/demo/build/index.js` with `PORT=4399`, `HOST=127.0.0.1`, `INTAKE_STATE_DIR=mkdtemp()`, polls until it answers inside a bounded timeout, and kills the child in `finally`.

```js
test("drain produces one run per fixture outcome", async () => {
  const runs = await drainAndList();
  const outcomes = Object.fromEntries(runs.map((r) => [r.document, r.outcome]));
  assert.deepEqual(outcomes, {
    "blank.pdf": "reject", "clean-order.pdf": "auto",
    "credit-warning.pdf": "auto", "letterhead.pdf": "review",
    "statement.pdf": "reject", "vague-line.pdf": "review",
  });
});
test("accept posts once and replays as a duplicate", async () => {
  const runs = await drainAndList();
  const held = runs.find((r) => r.outcome === "review");
  assert.equal((await post(`/api/runs/${held.id}/accept`, { corrections: [] })).status, 200);
  await post("/api/drain", {});
  assert.equal(await recordCount(), 1);
});
test("a correction with an unknown field is rejected", async () => {
  const held = (await drainAndList()).find((r) => r.outcome === "review");
  const res = await post(`/api/runs/${held.id}/accept`, { corrections: [{ field: "made.up", value: "x" }] });
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test apps/demo/tests/`
Expected: FAIL, `Cannot find module .../build/index.js`.

- [ ] **Step 3: Implement the adapters and routes**

`folder-inbox.ts` reads `fixtures/documents` sorted by name, `messageId` from the filename, dotfiles skipped.
`jsonl-record.ts` and `jsonl-log.ts` append one JSON object per line under `var/` (or `INTAKE_STATE_DIR`), assigning `seq` from the in-memory count while holding the queue. Records and events are JSON lines, so no document bytes are ever written.
`correction.ts` validates a `{ corrections: Array<{ field: string; value: string }> }` payload: unknown fields and non-positive quantities are `400` with a typed body. Acceptable fields come from the run's extracted document.
`wiring.ts` builds `Deps` once per process, wraps every mutation in one `createQueue()`, drains the inbox at boot, and watches it with `fs.watch` plus a 250ms debounce. `--fresh` truncates state before booting.
Manual `drain` processes every inbox document. Accept re-runs the gates with the corrections appended as `operator:correction` evidence, then posts if the gates clear; reject records a `decide.reject` with `operator:reject`.

- [ ] **Step 4: Run them to see them pass**

Run: `npm run build && node --test apps/demo/tests/`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add the demo adapters, API, lifecycle, and HTTP tests"
```

---

### Task 10: The review UI

**Files:**
- Create: `apps/demo/src/app.html`, `apps/demo/src/app.css`
- Create: `apps/demo/src/routes/+layout.svelte`, `+page.svelte`, `+page.server.ts`
- Create: `apps/demo/src/routes/run/[id]/+page.svelte`, `+page.server.ts`
- Create: `apps/demo/tests/ui.test.js`

**Interfaces:**
- Consumes: `drain()`, `runs()`, `runById()`, `accept(id, corrections)`, `reject(id)`.
- Produces: the four screens the README screenshots come from, plus `svelte-check` in the gate.

- [ ] **Step 1: Add the Svelte toolchain to the gate**

`apps/demo/package.json`: `@sveltejs/kit`, `@sveltejs/adapter-node`, `svelte`, `vite`, `svelte-check`, all pinned; scripts `build`, `typecheck` = `svelte-kit sync && svelte-check --tsconfig ./tsconfig.json`. `tsconfig.json` extends `$app/tsconfig` and lists `include` and `exclude`, because SvelteKit 3 no longer generates `.svelte-kit/tsconfig.json`. SvelteKit 3 also removed `svelte.config.js` and the `$lib` alias: the adapter is passed to the `sveltekit()` plugin in `vite.config.ts`, and `#lib` is declared in `package.json` `imports`. Root `typecheck` already runs core first, so no root change.

- [ ] **Step 2: Write the failing UI test**

```js
test("the queue renders a held run with its reason", async () => {
  const html = await get("/");
  assert.match(html, /Review/);
  assert.match(html, /line 1 needs a person/);
});
test("run detail shows the short-circuit as zero model calls", async () => {
  const auto = (await drainAndList()).find((r) => r.outcome === "auto");
  const html = await get(`/run/${auto.id}`);
  assert.match(html, /no model calls/i);
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `node --test apps/demo/tests/ui.test.js`
Expected: FAIL, the routes do not exist.

- [ ] **Step 4: Build the screens**

Queue: outcome counts as stat cards, rows carrying the hold reason, and `auto` rows marked `audit` so the person-in-the-loop claim stays visible.
Run detail: stage timeline from the events, field table with source and rule, decision reasons, and the `decide.shortcircuit` fact rendered as "no model calls".
Held run: accept, correct-inline, reject, each with an inline confirm step.
Replay: a button that re-drains and shows `ingest.duplicate`.
`app.css`: the spec's token architecture (paper, ink, accent, five status tones, flat surfaces, tabular numerals), system font stack only.

- [ ] **Step 5: Run it to see it pass**

Run: `npm run check && npm run demo`
Expected: gates green including `svelte-check`; `http://127.0.0.1:4321` drains six fixtures, and the held run accepts.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add the review UI"
```

---

### Task 11: Documentation, ADRs, and the demo script

**Files:**
- Create: `README.md`, `CONTRIBUTING.md`, `docs/{architecture.md,adapters.md,why-this-shape.md}`, `docs/decisions/{0001-local-first.md,0002-no-evidence-no-post.md,0003-short-circuit.md,0004-verify-after-posting.md}`, `docs/media/README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the first screen a visitor reads.

- [ ] **Step 1: Write the README first screen**

Order: one-sentence promise; Mermaid diagram of `ingest -> extract -> resolve -> decide -> post -> verify` with the hold branch; the three decisions as short headings; a fresh-clone block (`npm ci` once, then `npm run demo`, open the URL); screenshot embed; "Take it as a base" naming the four integration seams; the doc table.
State plainly that `npm ci` is the only networked step.

- [ ] **Step 2: Write `docs/adapters.md`**

One section per integration seam plus a short "supporting ports" section: what the port promises, the demo implementation, the production mapping (Graph, Document Intelligence, ERP, CRM) with a code sketch, and what the adopter must guarantee (idempotency, typed errors, bounded enumeration). Name the verification limitation: the pass compares against the local store, not the remote system.

- [ ] **Step 3: Write the four ADRs and `why-this-shape.md`**

Each ADR: context, decision, consequence, one alternative rejected. `why-this-shape.md` is the narrative rewritten from the private drafts, distributor swapped for Northgate, every client figure and identifier removed.

- [ ] **Step 4: Write the media script and update the changelog**

The screenshots are rendered from the running demo, so they do not need a person. `docs/media/README.md` gives the commands: build, start on a fixed port, then headless `chromium --screenshot` for the queue, a posted run and a held run. Saves `queue.png`, `run-detail.png`, `held-run.png`. A short recording (`demo.gif`) is optional and operator-recorded.

- [ ] **Step 5: Check the clean room without writing terms into the repo**

Run the identifier scan with the term list supplied from outside the repo, for example:

```bash
read -r -a TERMS < ~/.config/document-intake/cleanroom-terms
npm run check
for t in "${TERMS[@]}"; do ! grep -rniF -- "$t" README.md docs fixtures packages apps; done
```

Expected: gates green, no term found.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: add the README, adapter guide, ADRs, and demo script"
```

---

### Task 12: Ship the repo

**Files:**
- Modify: `.github/workflows/ci.yml`, `CHANGELOG.md`
- Create: `.github/ISSUE_TEMPLATE/idea.md`, `SECURITY.md`

**Interfaces:**
- Consumes: the green `check` chain and the media assets.
- Produces: `github.com/ultus-net/document-intake`, public, MIT, marked as a template.

- [ ] **Step 1: Confirm the gates, the assets, and the clean room**

Run: `npm run check`, then `ls docs/media/{queue.png,run-detail.png,held-run.png}`, then the scan from Task 11.
Expected: all three clean. No merge without the assets, because the README embeds them.

- [ ] **Step 2: Create the remote and push both branches**

`main` is empty, so push it first, then the work branch.

```bash
gh repo create ultus-net/document-intake --public \
  --description "Document to record, with a person in front of anything uncertain" \
  --source . --remote origin --disable-wiki
git branch -m feat/template
git push -u origin main
git push -u origin feat/template
```

- [ ] **Step 3: Open the issue and the PR, then record the review**

```bash
gh issue create --title "Ship the document-intake template" --body "The scaffold, core pipeline, demo, and docs."
gh pr create --base main --head feat/template \
  --title "feat: the document-intake template" --body "Fixes #1"
```

Then record the reviewer verdict with `record_review`.

- [ ] **Step 4: Merge, pull, then enable the template flag**

```bash
gh pr merge --squash --delete-branch
git checkout main && git pull --ff-only
gh api -X PATCH repos/ultus-net/document-intake -F is_template=true
```

Expected: repo public, flagged as a template, README rendering with its images.

- [ ] **Step 5: Cut the release from the merged commit**

`CHANGELOG.md` moves to `## 0.1.0 (2026-11-20)`, commit on `main`, then:

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin main --tags
gh release create v0.1.0 --generate-notes
```

---

## Notes for the executor

- Two things need tuning against reality: the extractor's line rule and the fixture text that lands either side of the hold band. Adjust the fixture generator, not the thresholds.
- Pin `pdfjs-dist` exactly and prove extraction on Node 22 with `getDocument({ data }).promise` before building anything on it.
- The demo's accept path re-runs the gates. Never let it post a value that skipped evidence, or the repo's central claim becomes false.
- `verify` compares against the local store. Do not describe it as confirming the record exists in a remote system.

---

## Execution notes (recorded after the build)

Deviations from the text above, with their reasons. The plan is otherwise the record of what ran.

- **SvelteKit 3 changed the setup surface.** It removed `svelte.config.js`, moved adapter options
  into the `sveltekit()` Vite plugin, replaced `$lib` with a `#lib` subpath import declared in
  `package.json`, and made `tsconfig.json` extend `$app/tsconfig`. The demo follows those rules, so
  Task 9 creates `app.html` and Task 10 does not create `svelte.config.js`.
- **CSRF stays on.** SvelteKit 3 always checks the request origin. The HTTP tests send an `origin`
  header rather than disabling the check. The browser path already sends one.
- **Money is cents at the boundary.** The extractor converts printed currency to cents, so line
  totals and the customer credit limit share one unit. Without this the credit-warning fixture
  could not exceed the limit.
- **The vague line is `Aurelia weave`.** `weave 4417` scored below the hold band against the
  catalogue name. Dropping the reference lands it at about `0.65`, between `0.55` and `0.82`. The
  fixture changed, not the thresholds.
- **A duplicate gets its own run id.** Reusing the original id made the projection regress the
  original run to `ingest` and mark a posted run as a duplicate. The suffix keeps both runs in the
  audit trail.
- **The demo gained three modules beyond the plan.** `catalogue.ts` and `customer-directory.ts`
  implement the two remaining seams against the fixture JSON. `http.ts` maps typed errors to status
  codes. The plan listed the adapters but not these files.
- **Screenshots are rendered, not recorded.** Headless Chromium captures the three PNGs from the
  running demo. The GIF remains optional.

