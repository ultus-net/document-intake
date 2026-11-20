# document-intake Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, runnable TypeScript template that takes a document from an inbox to a system of record, holding anything uncertain for a person, with an evidence trail for every field.

**Architecture:** `packages/core` is a pure library: ports, stages, gates, matching, event log and verification, with in-memory fakes and no I/O. `apps/demo` is a SvelteKit app that wires folder and JSONL adapters into core and renders the review queue. `fixtures/` holds four synthetic documents, one per outcome.

**Tech Stack:** Node 22, TypeScript strict, npm workspaces, `node:test`, `pdfjs-dist`, `pdf-lib` (fixtures only), SvelteKit with `adapter-node`.

**Spec:** `docs/superpowers/specs/2026-11-20-template-design.md`

## Global Constraints

- Node 22, TypeScript strict, ESM. `packages/core` targets Node only.
- `packages/core` runtime dependency is `pdfjs-dist` and nothing else. Any other dependency needs a one-line justification in the PR.
- Tests are `node:test`. Compile first, run `node --test dist`.
- Default path runs offline: no key, no account, no network.
- No client identifier in code, fixtures, docs, or commit history.
- The demo is single-process and single-writer. No locking.
- Licence MIT, `CHANGELOG.md` from the first commit.
- All generated state lives under `var/` and is gitignored.
- Event `ts` is ISO-8601 UTC. Matching thresholds are `>= 0.82` accept, `0.55 .. 0.82` hold, `< 0.55` reject.
- Idempotency key is `sha256(messageId + document bytes)`, hex, no normalisation.

## Review Focus

- A non-PDF file (`.docx`, `.png`) lands in the inbox. Expect a `reject` with a plain reason, never a crash or a stack trace in the UI.
- A PDF with no extractable text (a scan) arrives. Expect `unreadable` and a hold-for-a-person reason, not an empty order that posts.
- The same message is delivered twice. Expect one record and an `ingest.duplicate` event.
- A document whose lines are all freight or fee rows. Expect `reject` with reason `no matchable lines`, not a zero-line post.
- Two customers share a normalised name. Expect `review` with `ambiguous customer`, never the first match.

---

### Task 1: Workspace, gates, and licence

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `eslint.config.mjs`, `.gitignore`, `LICENSE`, `CHANGELOG.md`, `.github/workflows/ci.yml`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`, `packages/core/src/index.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `VERSION: string` from `@document-intake/core`. Scripts `lint`, `typecheck`, `test` at the root.

- [ ] **Step 1: Create the workspace files**

Root `package.json`: `"private": true`, `"workspaces": ["packages/*", "apps/*"]`, `"engines": {"node": ">=22"}`, `"type": "module"`. Scripts: `lint` = `eslint .`, `typecheck` = `npm run typecheck --workspaces --if-present`, `test` = `npm run test --workspaces --if-present`, `verify` = `npm run lint && npm run typecheck && npm run test`.

`tsconfig.base.json`: `target` `ES2022`, `module` `NodeNext`, `moduleResolution` `NodeNext`, `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `outDir` `dist`, `rootDir` `src`, `declaration`.

`packages/core/tsconfig.json` extends the base. `packages/core/package.json`: name `@document-intake/core`, `"exports": {".": "./dist/index.js"}`, `"types": "./dist/index.d.ts"`, scripts `build` = `tsc -p tsconfig.json`, `typecheck` = `tsc -p tsconfig.json --noEmit`, `test` = `npm run build && node --test dist`.

`eslint.config.mjs`: flat config, `typescript-eslint` recommended, ignore `dist`, `.svelte-kit`, `node_modules`, `var`.

`.gitignore`: `node_modules/`, `dist/`, `.svelte-kit/`, `var/`, `.env`.

`LICENSE`: MIT, `Copyright (c) 2026 ultus-net`. `CHANGELOG.md`: `# Changelog` then `## 0.1.0 (unreleased)` with one line naming this plan.

`.github/workflows/ci.yml`: on push and pull_request, Node 22, `npm ci`, `npm run verify`.

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
Expected: FAIL, `Cannot find module './index.js'` or missing export.

- [ ] **Step 4: Add the export**

`packages/core/src/index.ts`: `export const VERSION = "0.1.0";`

- [ ] **Step 5: Run the gates**

Run: `npm run verify`
Expected: lint clean, typecheck clean, 1 test passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold the workspace and its gates"
```

---

### Task 2: Types, errors, and the event log

**Files:**
- Create: `packages/core/src/types.ts`, `packages/core/src/errors.ts`, `packages/core/src/events.ts`, `packages/core/src/events.test.ts`

**Interfaces:**
- Consumes: `Clock` from `ports.ts` (created here as part of types? No: `ports.ts` is Task 3; declare `Clock` in `types.ts` and re-export from `ports.ts` later).
- Produces: `Outcome`, `Stage`, `Evidence`, `Decision`, `Event`, `EventLog`, `MemoryEventLog`, `IntakeError`, `PostedRecord`.

- [ ] **Step 1: Write the failing test**

`events.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { MemoryEventLog } from "./events.js";
import { fixedClock } from "./fakes.js";

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

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -w @document-intake/core`
Expected: FAIL, cannot resolve `./events.js`.

- [ ] **Step 3: Implement `types.ts`, `errors.ts`, `fakes.ts`, `events.ts`**

`types.ts` carries the interfaces quoted in the spec's "Core types", plus:

```ts
export interface PostedRecord {
  idempotencyKey: string; runId: string; postedAt: string;
  fields: Record<string, unknown>;
  lines: Array<{ sku: string; quantity: number }>;
  decision: Decision;
}
```

```ts
export interface Clock { now(): Date; }
export interface SourceDocument {
  messageId: string; filename: string; bytes: Uint8Array; receivedAt: string;
}
export interface LineItem {
  description: string; quantity: number; unitPrice?: number; lineTotal?: number;
}
export interface ExtractedDocument {
  status: "ok" | "unreadable" | "not-a-document";
  fields: Record<string, string>; lines: LineItem[];
}
export interface EventInput { runId: string; correlationId: string; stage: Stage;
  event: string; summary: string; data?: Record<string, unknown>; }
```

`errors.ts`: `export class IntakeError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = "IntakeError"; } }`.

`fakes.ts`: `fixedClock(iso: string): Clock`, whose `now()` returns a new `Date` each call.

`events.ts`: `MemoryEventLog` with `append`, `read`, `entries`. `seq` starts at 0. `ts` is `clock.now().toISOString()`. `append` returns the stored event, `read` returns a copy.

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -w @document-intake/core`
Expected: 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat: add core types, typed errors, and the event log"
```

---

### Task 3: Matching and thresholds

**Files:**
- Create: `packages/core/src/matching.ts`, `packages/core/src/matching.test.ts`, `packages/core/src/ports.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalise(text: string): string`, `trigramScore(a: string, b: string): number`, `classify(score: number, exactReference: boolean): "accept" | "hold" | "reject"`, `THRESHOLDS`, and every port interface: `Inbox`, `Extractor`, `Catalogue`, `CustomerDirectory`, `SystemOfRecord`, `Notifier`, `Clock`, `EventLog`, `Deps`.

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

- [ ] **Step 3: Implement `matching.ts` and `ports.ts`**

`normalise`: `NFKD`, strip combining marks, lowercase, replace every run of non `[a-z0-9]` with a space, trim. `trigramScore`: Jaccard over the sets of 3-character substrings of each normalised string. `THRESHOLDS = { accept: 0.82, hold: 0.55 } as const`. `classify` returns `accept` when `exactReference` or `score >= accept`, `hold` when `score >= hold`, else `reject`.

`ports.ts` declares the seven port interfaces from the spec plus `EventLog`, and:

```ts
export interface Deps {
  inbox: Inbox; extractor: Extractor; catalogue: Catalogue;
  directory: CustomerDirectory; record: SystemOfRecord;
  notifier: Notifier; clock: Clock; log: EventLog;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -w @document-intake/core`
Expected: 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat: add trigram matching and the port contracts"
```

---

### Task 4: Ingest, idempotency, and the duplicate path

**Files:**
- Create: `packages/core/src/idempotency.ts`, `packages/core/src/pipeline.ts`, `packages/core/src/fakes.ts` (extend), `packages/core/src/pipeline.test.ts`

**Interfaces:**
- Consumes: `Deps`, `SourceDocument`, `EventLog`, `SystemOfRecord`.
- Produces: `idempotencyKey(doc: {messageId: string; bytes: Uint8Array}): string`, `processDocument(doc: SourceDocument, deps: Deps): Promise<Run>`, where `Run` gains `duplicate?: boolean`.

- [ ] **Step 1: Write the failing test**

```ts
test("the same message twice yields one record and a duplicate event", async () => {
  const deps = happyDeps();
  const first = await processDocument(cleanDoc(), deps);
  const second = await processDocument(cleanDoc(), deps);
  assert.equal(first.duplicate, undefined);
  assert.equal(second.duplicate, true);
  assert.equal((await deps.record.list()).length, 1);
  assert.ok((await deps.log.read()).some((e) => e.event === "ingest.duplicate"));
});
test("a changed byte changes the key", () => {
  assert.notEqual(idempotencyKey(docA()), idempotencyKey(docB()));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -w @document-intake/core`
Expected: FAIL, `processDocument is not a function`.

- [ ] **Step 3: Implement**

`idempotency.ts` uses `node:crypto` `createHash("sha256")`, updating with the messageId bytes then the document bytes, hex output.

`pipeline.ts` orchestrates; `processDocument` computes the key, checks `deps.record.find`, emits `ingest.duplicate` and returns early when found, otherwise emits `ingest.accepted` and continues into the stages added by Task 5.

`fakes.ts` gains in-memory implementations of every port: `memoryRecord`, `memoryInbox`, `stubExtractor`, `stubCatalogue`, `stubDirectory`, `consoleNotifier`, and a `happyDeps()` builder wired to `cleanDoc()`.

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -w @document-intake/core`
Expected: 7 tests passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat: add ingest and idempotent duplicate handling"
```

---

### Task 5: Resolve, decide, and the gates

**Files:**
- Create: `packages/core/src/stages/resolve.ts`, `packages/core/src/stages/decide.ts`, `packages/core/src/pipeline.test.ts` (extend)

**Interfaces:**
- Consumes: `Catalogue.match(description)`, `CustomerDirectory.resolve(doc, fields)`, `classify`.
- Produces: `resolveLines(lines, catalogue): Promise<ResolvedLine[]>`, `decide(input): Decision`, `ResolvedCustomer { account?: string; score: number; ambiguous: boolean; creditLimitCents?: number; openBalanceCents?: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
test("unreadable documents reject with a plain reason", async () => {
  const run = await processDocument(scanDoc(), unreadableDeps());
  assert.equal(run.decision?.outcome, "reject");
  assert.match(run.decision!.reasons[0]!, /could not read/i);
});
test("a held line holds the run", async () => {
  const run = await processDocument(vagueLineDoc(), happyDeps());
  assert.equal(run.decision?.outcome, "review");
  assert.ok(run.decision!.reasons.includes("line 1 needs a person"));
});
test("all-resolved lines auto-post with no judge call", async () => {
  const judge = { review: () => { throw new Error("judge must not run"); } };
  const run = await processDocument(cleanDoc(), happyDeps({ judge }));
  assert.equal(run.decision?.outcome, "auto");
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

- [ ] **Step 3: Implement `resolve.ts` and `decide.ts`**

`resolve.ts` strips service rows by name (`freight`, `delivery`, `fee`, `surcharge`, `note`) before matching, then calls `catalogue.match` per line and maps through `classify`. Empty matchable set is a named result, not an exception.

`decide.ts` applies gates in this order: extractor status, empty matchable lines, held or rejected lines, customer ambiguity, then credit. Each reason string is fixed copy asserted by the tests. Credit never blocks.

`Deps` gains optional `judge?: Judge`, where `Judge.review` returns merged fields plus evidence. It is called only when a line is held and a judge exists.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -w @document-intake/core`
Expected: 13 tests passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat: add resolution, gates, and the deterministic short-circuit"
```

---

### Task 6: Post, the evidence invariant, and verification

**Files:**
- Create: `packages/core/src/stages/post.ts`, `packages/core/src/verify.ts`, `packages/core/src/post.test.ts`, `packages/core/src/verify.test.ts`

**Interfaces:**
- Consumes: `SystemOfRecord.append`, `SystemOfRecord.list`, `Clock`.
- Produces: `postRecord(run, deps): Promise<PostedRecord>`, `verifyAll(deps, olderThanHours: number): Promise<VerifyResult[]>`, `VerifyResult { runId: string; status: "ok" | "missing" | "drift"; detail: string }`.

- [ ] **Step 1: Write the failing tests**

```ts
test("the clean order's event trail is stable", async () => {
  const deps = happyDeps();
  await processDocument(cleanDoc(), deps);
  assert.deepEqual((await deps.log.read()).map((e) => e.event), [
    "ingest.accepted", "extract.complete", "resolve.lines",
    "decide.auto", "post.written",
  ]);
});
test("post refuses a field with no evidence", async () => {
  await assert.rejects(
    () => postRecord(runWithoutEvidence(), happyDeps()),
    (e: unknown) => e instanceof IntakeError && e.code === "no-evidence",
  );
});
test("verify reports drift after an out-of-band edit", async () => {
  const deps = happyDeps();
  await processDocument(cleanDoc(), deps);
  const [record] = await deps.record.list();
  await deps.record.append({ ...record!, fields: { ...record!.fields, customer: "WRONG" } });
  const [result] = await verifyAll(deps, 0);
  assert.equal(result!.status, "drift");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -w @document-intake/core`
Expected: FAIL, `postRecord is not a function`.

- [ ] **Step 3: Implement**

`post.ts` asserts every field in the posted shape appears in `decision.evidence`, throwing `IntakeError("no-evidence", ...)` otherwise, then appends `PostedRecord` and emits `post.written`. The duplicate path is settled by `find` before append.

`verify.ts` replays each record's decision against the stored record: `missing` when the key is gone, `drift` when any evidenced field differs, `ok` otherwise. Emits `verify.*`.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -w @document-intake/core`
Expected: 15 tests passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat: post with an evidence invariant and verify after posting"
```

---

### Task 7: The template extractor and the fixtures

**Files:**
- Create: `scripts/make-fixtures.ts`, `packages/core/src/extract/template-extractor.ts`, `packages/core/src/extract/template-extractor.test.ts`
- Create: `fixtures/documents/{clean-order,vague-line,statement,credit-warning}.pdf`, `fixtures/catalogue.json`, `fixtures/customers.json`

**Interfaces:**
- Consumes: `Extractor`, `ExtractedDocument`.
- Produces: `createTemplateExtractor(): Extractor`.

- [ ] **Step 1: Write the fixture generator**

`scripts/make-fixtures.ts` uses `pdf-lib` (devDependency, justified: it renders the four sample documents and nothing else) to emit four A4 PDFs from a fictional distributor, "Northgate Interiors":
`clean-order` (header fields plus three catalogue lines), `vague-line` (one line reading "weave 4417"), `statement` (an account statement, no order fields), `credit-warning` (two large lines). It also writes `catalogue.json` (six products with `sku`, `name`, `manufacturerRef`) and `customers.json` (four companies, one with a credit limit under the order total).

- [ ] **Step 2: Write the failing extractor tests**

```ts
test("reads the clean order", async () => {
  const doc = await pdf("clean-order");
  const out = await createTemplateExtractor().extract(doc);
  assert.equal(out.status, "ok");
  assert.equal(out.fields.purchaseOrder, "PO-1042");
  assert.equal(out.lines.length, 3);
});
test("a statement is not an order", async () => {
  assert.equal((await extract("statement")).status, "not-a-document");
});
test("a non-PDF is not a document", async () => {
  const out = await createTemplateExtractor().extract(nonPdfDoc());
  assert.equal(out.status, "not-a-document");
});
test("a PDF with no text is unreadable", async () => {
  assert.equal((await extract("blank")).status, "unreadable");
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npm test -w @document-intake/core`
Expected: FAIL, template extractor missing or fixture absent.

- [ ] **Step 4: Implement the extractor**

`createTemplateExtractor()` parses with `pdfjs-dist` `getDocument`, joins page text, then applies labelled-field rules (`Purchase order`, `Date`, `Deliver to`) and a line rule that reads `description  qty  unit  total`. It returns `not-a-document` when no order fields and no lines are found, `unreadable` when the text layer is empty. `blank.pdf` is generated with a rectangle only.

- [ ] **Step 5: Run them to see them pass**

Run: `npm run verify && ls fixtures/documents`
Expected: 19 tests passing, four PDFs listed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add the template extractor and four sample documents"
```

---

### Task 8: Demo adapters, API, and smoke test

**Files:**
- Create: `apps/demo/{package.json,tsconfig.json,svelte.config.js,vite.config.ts}`
- Create: `apps/demo/src/lib/server/{folder-inbox,jsonl-record,jsonl-log,wiring}.ts`
- Create: `apps/demo/src/routes/api/{drain,runs}/+server.ts`, `apps/demo/src/routes/api/runs/[id]/accept/+server.ts`
- Create: `apps/demo/tests/smoke.test.js`

**Interfaces:**
- Consumes: `processDocument`, fixtures, `@document-intake/core`.
- Produces: the built demo server on `http://localhost:4321`; `POST /api/drain`, `GET /api/runs`, `POST /api/runs/:id/accept`.

- [ ] **Step 1: Write the failing smoke test**

Plain ESM JS so the test needs no build of its own. It spawns `node apps/demo/build/index.js` on port 4399, polls `/api/runs` until it answers, then asserts:

```js
const outcomes = Object.fromEntries(runs.map((r) => [r.document, r.outcome]));
assert.deepEqual(outcomes, {
  "clean-order.pdf": "auto", "vague-line.pdf": "review",
  "statement.pdf": "reject", "credit-warning.pdf": "auto",
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test apps/demo/tests/smoke.test.js`
Expected: FAIL, the server exits with `Cannot find module build/index.js`.

- [ ] **Step 3: Implement the adapters and routes**

`folder-inbox.ts`: reads `fixtures/documents` sorted by name, deriving `messageId` from the filename, skipping dotfiles.
`jsonl-record.ts`: one JSON object per line in `var/records.jsonl`, `find` scans, `append` uses `appendFile`, `list` reads all.
`jsonl-log.ts`: same shape for `var/events.jsonl`, assigning `seq` from the count.
`wiring.ts`: builds `Deps` once per process, exporting `drain()`, `runs()`, `runById()`, `accept(id)`.
Routes: `POST /api/drain` processes every inbox document, `GET /api/runs` returns the run summaries, `POST /api/runs/[id]/accept` re-runs the gates with the operator's correction then posts. `wiring.ts` is what the UI imports in Task 9.

- [ ] **Step 4: Run it to see it pass**

Run: `npm run verify && node --test apps/demo/tests/smoke.test.js`
Expected: 20 tests passing, smoke test green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add the demo adapters, API, and smoke test"
```

---

### Task 9: The review UI

**Files:**
- Create: `apps/demo/src/app.html`, `apps/demo/src/app.css`
- Create: `apps/demo/src/routes/+layout.svelte`, `apps/demo/src/routes/+page.svelte`, `apps/demo/src/routes/+page.server.ts`
- Create: `apps/demo/src/routes/run/[id]/+page.svelte`, `apps/demo/src/routes/run/[id]/+page.server.ts`

**Interfaces:**
- Consumes: `drain()`, `runs()`, `runById()`, `accept(id)` from `apps/demo/src/lib/server/wiring.ts`.
- Produces: the four screens the README screenshots come from.

- [ ] **Step 1: Build the four screens**

Queue: outcome counts as stat cards, rows carrying the hold reason. Run detail: stage timeline from the events, field table with source and rule, decision reasons. Held run: accept, correct-inline, reject, each with an inline confirm step. Replay: a button that re-drains and shows `ingest.duplicate`.
`app.css`: the token architecture from the spec (paper, ink, accent, five status tones, flat surfaces, tabular numerals). Vendored fonts only, no CDN.
The root script `demo`: `npm run build && node apps/demo/build/index.js`, with `DEMO_PORT` defaulting to 4321.

- [ ] **Step 2: Run it by hand and by gate**

Run: `npm run demo`, open `http://localhost:4321`, drain, open the held run, accept it, confirm the record appears. Then `npm run verify`.
Expected: every screen renders with seeded data, no console errors, gates green.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add the review UI"
```

---

### Task 10: Documentation, ADRs, and the recorded demo

**Files:**
- Create: `README.md`, `CONTRIBUTING.md`, `docs/{architecture.md,adapters.md,why-this-shape.md}`, `docs/decisions/{0001-local-first.md,0002-no-evidence-no-post.md,0003-short-circuit.md,0004-verify-after-posting.md}`, `docs/media/README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the first screen a visitor reads.

- [ ] **Step 1: Write the README first screen**

Order: one-sentence promise, Mermaid diagram of `ingest -> extract -> resolve -> decide -> post -> verify` with the hold branch, the three decisions as three short headings, a demo block (`npm run demo`, then open the queue), a screenshot embed pointing at `docs/media/queue.png`, then "Take it as a base" naming the four files to replace, then the doc table.

- [ ] **Step 2: Write `docs/adapters.md`**

One section per seam: what the port promises, the demo implementation, the production mapping (Graph, Document Intelligence, ERP, CRM) with a code sketch, and what the adopter must guarantee (idempotency, error typing, no unbounded enumeration).

- [ ] **Step 3: Write the four ADRs and `why-this-shape.md`**

Each ADR: context, decision, consequence, one alternative rejected. `why-this-shape.md` is the narrative rewritten from the private drafts with the distributor swapped for Northgate and every client figure and identifier removed.

- [ ] **Step 4: Write `docs/media/README.md` and update the changelog**

The media README is an operator script, because recording a screen is the one step an agent cannot do: 90 seconds, start at the queue, drop `clean-order.pdf`, open the run, show the evidence table, open the held run, accept it, show the record. Saves `queue.png`, `run-detail.png`, `demo.gif`.

- [ ] **Step 5: Verify links and run the gates**

Run: `npm run verify && grep -rniE 'jacobsen|carpet court|d365|hubspot' README.md docs fixtures packages apps --include='*.md' --include='*.ts' --include='*.json'`
Expected: gates green, no matches.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: add the README, adapter guide, ADRs, and demo script"
```

---

### Task 11: Ship the repo

**Files:**
- Modify: `.github/workflows/ci.yml`, `CHANGELOG.md`
- Create: `.github/ISSUE_TEMPLATE/idea.md`, `SECURITY.md`

**Interfaces:**
- Consumes: the green `verify` chain.
- Produces: `github.com/ultus-net/document-intake`, public, MIT.

- [ ] **Step 1: Confirm the gates and the clean-room check**

Run: `npm run verify`, then the identifier grep from Task 10.
Expected: both clean.

- [ ] **Step 2: Create the remote, then push main and the branch**

```bash
gh repo create ultus-net/document-intake --public \
  --description "Document to record, with a person in front of anything uncertain" \
  --source . --remote origin --disable-wiki
git push -u origin main
git push -u origin docs/template-design
```

- [ ] **Step 3: Open the issue and the PR, then record the review**

```bash
gh issue create --title "Ship the document-intake template" --body "The scaffold, core pipeline, demo, and docs."
gh pr create --title "feat: the document-intake template" --body "Fixes #1"
```

Then record the reviewer verdict with `record_review`.

- [ ] **Step 4: Merge, then enable the template flag**

```bash
gh pr merge --squash --delete-branch
gh api -X PATCH repos/ultus-net/document-intake -F is_template=true
```

Expected: repo public, marked as a template, README rendering.

- [ ] **Step 5: Cut the release**

`CHANGELOG.md` moves to `## 0.1.0 (2026-11-20)`, commit, `git tag -a v0.1.0 -m "v0.1.0"`, `git push --tags`, `gh release create v0.1.0 --generate-notes`.

---

## Notes for the executor

- Two things will need tuning against reality: the extractor's line rule and the fixture text that lands either side of the hold band. Adjust the fixture generator, not the thresholds.
- `pdfjs-dist` in Node needs `--no-warnings` on some versions for its `Promise.withResolvers` warning. Pin the version and keep the warning out of test output.
- The demo's accept path re-runs the gates. Never let it post a value that skipped evidence, or the repo's central claim becomes false.
