# Changelog

## Unreleased

- `docs/decisions/README.md` is the decision index and the only hand-maintained summary. It holds one
  row per ADR with the problem, options, decision, cost, falsification signal, and the undo command.
- `npm run docs:decisions` renders `docs/why-this-shape.md` from that index and, with `--vault`,
  writes one notebook note per row. `--check` writes nothing and fails a stale document;
  `npm run check` runs it.
- The four ADRs carry an explicit `**Date:**` line so a generated note has a deterministic `created`.
- `scripts/decisions.mjs` is covered by `scripts/decisions.test.mjs` (15 cases), run by
  `npm run test:scripts`.

## 0.1.0 (2026-11-21)

- A runnable TypeScript template that takes a document from an inbox to a system of record, holds
  anything uncertain for a person, and keeps evidence for every posted field.
- Core pipeline: ingest, extract, resolve, decide, post, with an event log, a run projection and a
  delayed verification pass.
- Deterministic matching with a documented hold band, a second independent identity read, and typed
  failure handling for unreadable and non-document inputs.
- Idempotent ingest keyed by a length-prefixed SHA-256 over the message id and bytes, including held
  and rejected documents.
- An evidence invariant that refuses to post a value with no matching evidence, with operator
  corrections and acceptances recorded as evidence.
- A SvelteKit demo: folder inbox, JSONL record store and event log, review queue, run detail, accept,
  correct, reject and replay.
- Six synthetic fixtures and their generator, covering automatic posting, a credit warning, a held
  line, a letterhead disagreement, a non-order and a scan with no text layer.
- MIT licence, pinned dependencies, CI, and the architecture, adapter and decision records.
