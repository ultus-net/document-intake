# Design: document-intake, a public template for document-to-record pipelines

- Status: draft, awaiting operator approval
- Date: 2026-11-20
- Owner: ultus-net (github.com/ultus-net/document-intake)
- Licence: MIT

## Why

A working document-to-record pipeline exists in a private client repository. It
reads purchase orders out of a shared mailbox, extracts them, matches them
against master data, sends the uncertain ones to a person, posts the rest, and
then verifies the post later. The interesting part is not the domain. It is the
shape: deterministic where it can be, judgement only where it must be, a person
in front of anything uncertain, and an evidence trail for every field.

That shape has no public example. This repo is that example, rebuilt clean, with
no client code, no client name, no client metrics. It doubles as a portfolio
piece and as a base an engineer can fork for their own intake problem.

## Who it is for

1. A hiring manager, skimming. They read the top of the README, look at one
   diagram and one screen, and leave with the three decisions in their head.
2. An engineer, evaluating. They clone it, run one command, watch a document go
   end to end, then read `docs/adapters.md` to see what they replace.

Both are served by the same artefact: a real working demo, not a mock.

## Goals

- One command runs the pipeline end to end with no cloud account, no API key and
  no network.
- The four external seams are obvious and replaceable in one file each.
- The review UI shows a run's stage timeline, per-field evidence, and the hold
  and accept actions.
- The README's first screen carries the architecture and the three decisions.
- Every claimed capability is demonstrated by a committed sample document.

## Non-goals

- Production deployment, hosting, or a live public instance.
- Real ERP, CRM, mailbox or document-intelligence integration.
- Multi-tenancy, user accounts, authentication, or authorisation.
- Sending email, notifications beyond the console, or scheduled polling.
- OCR of handwriting, or extraction quality beyond the sample documents.
- A general workflow engine. This is one pipeline, not a platform.

## Anti-goals

These would each make the repo a failure even if it runs:

- A copy of the client repository with names substituted. Residue, and a
  licensing problem.
- A template that needs Azure, an LLM key, or a mailbox to show anything.
- Documentation that promises what the demo cannot show.
- Invented or borrowed metrics. No production percentages appear without the
  client's written approval.
- A framework abstraction that hides the pipeline. The pipeline is the product.

## What gets generalised

Three decisions carried across. These are what the README argues.

1. **Read the document twice, from different angles.** A structured extractor
   and an independent identity read disagree on purpose. The disagreement is a
   signal: when the letterhead is the supplier's own, the first read picks the
   supplier, and the second picks the sender.
2. **Deterministic short-circuit.** When every line matches, the account
   resolves and the document type is clear, no model runs. The model is reserved
   for genuine judgement, and its output is merged with a reason per field.
3. **A person in front of anything uncertain.** The model cannot say it is
   unsure, so the pipeline gives it permission by routing to a hold queue. In
   the real system a person still sees every order after it posts, which is how
   a confident-but-wrong merge gets caught. The demo keeps that honest: `auto`
   posts and stays in the queue marked for audit; `review` holds before posting.
   The system never guesses a value that reaches the record.

Two supporting patterns travel with them: an append-only event log keyed by
correlation id, and a delayed verification pass, because a successful post is
not proof the record exists.

## Approaches considered

**A. Local-first vertical slice (chosen).** One TypeScript workspace. The demo
app watches a folder, runs the pipeline, writes a JSON record store and serves
the review UI. Every external system sits behind an interface with a fixture
implementation. Cloud adapters are documented, not required.

**B. Azure-native thin clone.** Functions plus Graph plus Document Intelligence,
with the Logic App connector replaced by a timer-triggered mailbox poll. Closest
to the real system. Rejected: it cannot run without a subscription, which breaks
the first goal and makes it useless to the second audience.

**C. Narrative showcase, no template.** The private repo already holds two blog
drafts at 699 and 180 lines. Polishing those is the fastest route to a readable
story. Rejected: it does not give an engineer anything to fork, and the showcase
is only credible if the artefact exists.

A was chosen because it is the only one a stranger can run in a minute. B
survives as documentation in `docs/adapters.md`, which maps each seam to its
Azure equivalent with a code sketch.

## Shape

### Layout

```
document-intake/
  README.md                  first screen: diagram, three decisions, demo, links
  docs/
    why-this-shape.md        the narrative, rewritten, no client material
    architecture.md          stages, types, invariants
    adapters.md              the four seams and their Azure equivalents
    decisions/               ADRs, one per real trade-off
    media/                   demo recording and screenshots
  packages/core/             pipeline, gates, evidence, event log. No I/O.
  apps/demo/                 SvelteKit review UI, folder inbox, JSON stores
  fixtures/
    documents/               four synthetic PDFs, one per outcome
    catalogue.json           fictional product catalogue
    customers.json           fictional customer directory
```

Two packages. `core` is the part an engineer lifts. `apps/demo` is the part that
makes it visible. No third package, no shared build tooling beyond npm
workspaces.

### Stack

- TypeScript, strict, Node 22. Same stack as the real system, so no new language
  to defend.
- `packages/core` depends on `pdfjs-dist` for text extraction and nothing else.
- `apps/demo` is SvelteKit with `adapter-node`, server routes calling `core`.
  `npm run demo` builds, drains the inbox once, then serves on
  `localhost:4321`. It never opens a browser.
- Assets are vendored. No CDN fonts, no analytics, no network call in the
  default path, so the demo looks the same on a machine with no egress.
- Tests use the built-in `node:test`. No test framework dependency.
- CI is GitHub Actions and headless: lint, typecheck, unit tests, then the demo
  smoke run over HTTP. No browser automation.
- Dependencies added beyond these need a one-line justification in the PR.

### Core types

These are the contract, and the reason the pipeline is reusable.

```ts
type Outcome = "auto" | "review" | "reject";

interface Evidence {
  field: string;        // "customer.account", "line[2].product"
  value: unknown;
  source: string;       // "extractor:header", "catalogue:ref", "agent:merge"
  rule?: string;        // the named rule that produced or accepted it
  confidence?: number;  // 0..1, only where a producer can honestly supply it
}

interface Decision {
  outcome: Outcome;
  reasons: string[];    // human-readable, shown in the UI verbatim
  evidence: Evidence[];
}

interface Run {
  id: string;
  correlationId: string;
  stage: Stage;
  decision?: Decision;
  events: Event[];
}

interface Event {
  seq: number;              // monotonic within the store
  ts: string;               // ISO 8601 UTC
  runId: string;
  correlationId: string;
  stage: Stage;
  event: string;            // "extract.complete", "gate.hold", "post.written"
  summary: string;          // one line, rendered in the UI verbatim
  data?: Record<string, unknown>;
}
```

`var/events.jsonl` holds one event per line, append-only. `npm run demo --
--fresh` truncates it and the record store. The UI reads only this file, so the
audit trail and the screen cannot disagree.

The invariant: nothing reaches the record store without a `Decision`. A field
without evidence does not post.

### Seams

Seven interfaces, all in `packages/core/src/ports.ts`:

| Port | Demo implementation | Replaced by |
|---|---|---|
| `Inbox` | folder watcher | Graph, IMAP |
| `Extractor` | template + heuristic reader | Document Intelligence, any LLM |
| `Catalogue` | JSON with reference and trigram matching | ERP product master |
| `CustomerDirectory` | JSON, email then name then exact account | CRM |
| `SystemOfRecord` | JSONL append store | ERP posting API |
| `Notifier` | console | chat, email |
| `Clock` | real time | fixed time in tests |

The optional LLM extractor is one implementation behind `Extractor`, configured
by an OpenAI-compatible base URL and key. Unset means never called. This keeps
the claim "open frameworks" literal: no provider is load-bearing, including the
demo's.

The demo is single-process and single-writer. `SystemOfRecord` appends one JSON
line per record with no lock, and the port says so: one writer, no concurrency.
Anything else belongs to the adapter an adopter writes.

### Pipeline

```
ingest -> extract -> resolve -> decide -> post -> verify
```

- `ingest` derives the idempotency key as `sha256(messageId + document bytes)`.
  `messageId` is whatever the `Inbox` implementation treats as stable: a
  filename in the demo, a Graph message id in production. The whole file is
  hashed and the bytes are not normalised, so a re-saved PDF is a new document.
- `extract` produces fields plus line items. `Extractor` is async and returns a
  whole-document result: a `status` of `ok`, `unreadable` or `not-a-document`,
  the fields, and the lines. It does not stream, and it supplies confidence only
  per field and only where the producer can honestly supply it. Lines that are
  freight, fees or notes are stripped by a named rule before matching.
- `resolve` matches lines against the catalogue and the document against the
  customer directory. Ambiguity is a first-class result, not an error.
  Matching is deterministic and named. An exact manufacturer reference accepts.
  Otherwise a trigram Jaccard score on the normalised name accepts at 0.82 or
  above, holds between 0.55 and 0.82, and rejects below 0.55. The thresholds are
  constants in one file, and the fixtures sit either side of the hold band.
- `decide` applies the gates: validity (unreadable, non-order, empty), matching
  confidence, customer ambiguity, credit warning. Only unmatched or conflicting
  fields reach judgement, and only then does an agent run, if configured.
- `post` writes the record once, keyed by idempotency key.
- `verify` runs on demand (`npm run verify`) against records older than a
  threshold and records what the record store says now. This demonstrates the
  lesson that a successful post is not proof.

Each stage emits events with the correlation id. `events.jsonl` is append-only
and is the audit trail the UI reads.

### Review UI

Four screens, no more.

1. **Queue.** Runs by outcome, each row carrying the reason it is held.
2. **Run detail.** Stage timeline, extracted fields with their evidence, and the
   decision with its reasons. This is the screen that sells the design.
3. **Held run.** The same view plus accept, correct-inline, and reject. Accept
   re-runs the gates rather than bypassing them.
4. **Replay.** Re-run a document and show that the second run adds no second
   record.

Visual language: reuse the operational dashboard's token architecture (paper,
ink, accent, five status tones, flat-by-default, tabular numerals), rewritten
for this repo. It reads as an instrument, not a landing page.

The folder watcher is `fs.watch` with a 250ms debounce and no watcher
dependency. On a platform where `fs.watch` is unreliable, the demo still drains
the inbox at boot and on an explicit `POST /api/drain`, so the one-command path
never depends on the watcher.

### Demo data

Four synthetic documents from a fictional distributor, each forcing a different
outcome:

| Document | Outcome | What it proves |
|---|---|---|
| clean order | auto | the short-circuit, zero model calls |
| vague product line | review | hold with the reason visible |
| supplier statement | reject | the validity gate |
| order over a credit limit | auto + warning | warnings inform, they do not block |

Committed PDFs, generated once by a script in `scripts/`, small enough to live
in git.

## Constraints

- Runs offline. No key, no account, no network in the default path.
- No client identifier, in code, fixtures, docs or commit history. Fresh repo,
  not a fork.
- No copied client code. Clean-room rewrite from the design, which is also what
  keeps employer approval out of the critical path. If the operator wants the
  production figures or any original code, that needs written approval and is a
  separate change.
- Licence MIT, `CHANGELOG.md` from the first commit, `CONTRIBUTING.md` naming the
  four seams to replace.
- Write paths are off by default in the demo's own sense: posting writes to a
  local file, and the verify pass is manual.

## Evidence for the showcase

- A 60 to 90 second recording: drop a PDF, watch the run, open the held one,
  accept it, see the record. Embedded in the README, also in `docs/media/`.
- Two screenshots: queue and run detail.
- README top: one Mermaid diagram, the three decisions as headings, the demo
  link, then the "take it as a base" section.

## Testing

- One test per gate outcome, each asserting the outcome and the reason string.
- An idempotency test: the same document twice yields one record and an event
  saying the second was skipped.
- A golden event-trail test for the clean order.
- A verification test. `verify` reports `ok`, `missing` or `drift`. It passes
  only when every posted field still resolves to the same evidence and the
  record still exists. The test writes a record out of band and expects `drift`.
- A smoke test that starts the server, drains the inbox through the HTTP
  endpoint, and asserts the queue returns the seeded runs with their outcomes.
  Headless, no browser.
- Fixtures are synthetic. Each fixture names its generator in a comment beside
  the test, since there is no real payload to cite.

## Deferred

- Hosted read-only demo. Decided against for now; recorded demo instead.
- IMAP inbox adapter.
- A second extractor implementation beyond the optional LLM one.
- npm publication of `core`. Fork and copy is the supported path until there is
  a second consumer.

## What is left to the builder

- Scaffold the workspace, CI (lint, typecheck, test, one demo smoke run), and
  the sample document generator.
- Write the four ADRs the pipeline earns: local-first, no evidence no post,
  deterministic short-circuit, verify after posting.
- Record the demo, take the screenshots, write the README copy from this design.
- Rewrite the narrative in `docs/why-this-shape.md` from the private drafts,
  removing every client identifier and figure.
