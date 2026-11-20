# Architecture

The repository is a vertical slice: one document type, six fixtures, three outcomes. The point is
the shape of the pipeline, not the breadth of the document support.

## Layout

```
packages/core/src
  types.ts          the domain types: Run, Decision, Evidence, Event, PostedRecord
  ports.ts          the eight interfaces an implementation provides
  pipeline.ts       ingest -> extract -> resolve -> decide -> post
  stages/resolve.ts strips service rows, matches lines, classifies the score
  stages/decide.ts  the gates, in order, with fixed reason strings
  stages/post.ts    builds the record and enforces the evidence invariant
  projection.ts     rebuilds runs from the event log
  verify.ts         compares posted keys with the record store
  events.ts         the in-memory event log
  queue.ts          the serial queue used by the demo
  extract/          the template extractor and the independent identity read
  matching.ts       normalise, trigram score, the thresholds

apps/demo
  src/lib/server/   folder inbox, JSONL log, JSONL record store, catalogue,
                    customer directory, correction validation, wiring
  src/routes/api/   drain, runs, accept, reject
  src/routes/       the review queue and run detail screens
```

`packages/core` has one runtime dependency, `pdfjs-dist`. Everything else is the Node standard
library. The demo depends on SvelteKit and on core.

## The run

A run moves through `ingest`, `extract`, `resolve`, `decide` and `post`, in that order. Each stage
appends an event carrying the correlation id and the payload the next stage needs.

| Stage | Event | Payload |
|---|---|---|
| ingest | `ingest.accepted` or `ingest.duplicate` | idempotency key, document reference |
| extract | `extract.complete` | extracted fields, identity read, lines |
| resolve | `resolve.lines` | resolved lines with score and rule |
| decide | `decide.shortcircuit`, `decide.hold`, `decide.reject` | decision, reason strings |
| post | `post.written` | the posted record |

`rebuildRuns(events)` folds these events by `runId`. The UI and the accept path both read runs from
the projection, so a restart loses nothing and a held run can still be accepted. The log is the
store: no separate run table exists.

## The evidence invariant

`post` builds one evidence entry per posted value: `field:<name>` for each field, `line:<index>:sku`
and `line:<index>:quantity` for each line. It then checks every posted value against its evidence
entry, by value, and throws `IntakeError("no-evidence")` on a mismatch. A field can therefore carry
a traceable source even when the outcome is automatic.

Operator input is evidence:

- a correction is `{ source: "operator:correction" }`
- accepting a hold is `{ source: "operator:accept" }`
- rejecting is `{ source: "operator:reject" }`

Validity is not negotiable. Only a run whose decision is `review` can be accepted. A rejected
document cannot be accepted into the record store.

## Decisions and gates

`decide` applies gates in a fixed order and returns fixed reason strings, which the UI shows
verbatim:

1. `unreadable` becomes `could not read the document`
2. `not-a-document` becomes `not a document we can process`
3. an empty matchable set becomes `no matchable lines`
4. a held or rejected line becomes `line N needs a person`
5. the extractor and identity read disagreeing becomes `extractor and identity read disagree`
6. an ambiguous customer becomes `ambiguous customer`
7. over the credit limit adds `over credit limit` and does not block

The short-circuit is deliberate: `auto` is emitted with `modelCalls: 0`, and the optional `Judge` is
called only when a line is held and a judge is configured.

## Matching and identity

An exact catalogue name or manufacturer reference accepts. Otherwise a trigram Jaccard score on the
normalised name accepts at `0.82`, holds from `0.55` to `0.82`, and rejects below `0.55`. The
thresholds live in one file.

The document is read twice on purpose. The extractor reads labelled header fields and the line
table. The identity read scans backwards from the last printed email address, which is where a
sender's signature lives, and takes the company on that line or the nearest company line above it.
When a document is printed on one organisation's letterhead but sent by another, the two reads
disagree and the run is held.

## Idempotency

The key is `sha256(len(messageId) + ":" + messageId + bytes)`, hex. The length prefix prevents two
different identifier and byte splits from colliding. A document is a duplicate when the log already
holds an `ingest.accepted` event for the key, or the record store already holds it. The check reads
the log, not just the record store, so a held or rejected document does not re-run on every drain.

Duplicates get their own run id and an `ingest.duplicate` event, so they appear in the audit trail
without overwriting the original run's projection.

## Concurrency

The demo is single-process. `createQueue()` chains every ingest, accept and append onto one promise,
so a find-then-append cannot interleave with another request. `SystemOfRecord` says one writer and
no cross-process concurrency; anything else is the adopter's adapter to solve.

## Verification

`verifyAll` reads `post.written` keys from the log, selects those older than the threshold, and
compares each with the latest revision in the store. `missing` means the log says it posted and the
store no longer holds it. A differing value is `drift`. Otherwise it is `ok`.

This compares against the local store. It does not prove that a remote system still holds the
record. That limitation is stated wherever `verify` is described.

## Failure handling

- A parser failure is `unreadable`, never an unhandled throw that reaches the UI.
- A non-PDF is `not-a-document`.
- Validation failures in the demo API are typed `IntakeError` codes mapped to `400`, `404` or `409`.
- The demo logs an unexpected failure once and returns a generic body, so no stack trace reaches the
  screen.
