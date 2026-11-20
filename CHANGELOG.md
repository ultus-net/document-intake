# Changelog

## 0.1.0 (unreleased)

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
