# Decision index

The source for `docs/why-this-shape.md` and for the notebook notes generated into
a vault. Add one row per ADR in the same commit as the ADR.

The five fields are the problem, the options considered, the decision, what the
choice costs, and the signal that would show it was wrong. `Undo` names the
command that reverses the decision, because a notebook note's `Rollback` needs
both a falsifier and an undo command.

Regenerate everything with:

```bash
npm run docs:decisions
```

CI runs `npm run docs:decisions -- --check` and fails when the index and the
generated documents disagree.

| ADR | Problem | Options | Decision | Cost | Falsification signal | Undo |
|---|---|---|---|---|---|---|
| [0001](0001-local-first.md) Local-first vertical slice | A template must be readable and runnable by an engineer judging the architecture and a hiring manager judging whether the author can ship, without an account, a key, or a cloud deployment. | A hosted demo with a live model and a seeded cloud store; a local-first vertical slice with a local implementation of every port. | Ship one vertical slice that runs with `npm ci` then `npm run demo`; every port has a local implementation and the default path makes no network call. | One document shape, six fixtures, no OCR and no multi-tenant concerns; breadth is traded for a readable, runnable path. | A clean clone needs a network call, an account, a key, or more than two minutes to reach the first screen. | `git revert -m 1 624c59e` removes the slice. |
| [0002](0002-no-evidence-no-post.md) No evidence, no post | An intake system that posts values without a trace cannot be audited or corrected with confidence; the failure is a plausible wrong value with no origin, not a crash. | Log evidence but treat it as advisory; build one evidence entry per posted value and refuse a post that disagrees with it. | `post` builds an evidence entry per posted value and throws `IntakeError("no-evidence")` on a mismatch; operator input is evidence with its own source. | A legitimate post can fail when a producer forgets evidence, so the failure is loud and typed rather than silently accepted. | A posted value has no evidence entry, or a value that differs from its evidence is posted without `IntakeError("no-evidence")`. | `git revert be9f17e` (also removes 0004's verify pass). |
| [0003](0003-short-circuit.md) Short-circuit before any model call | The common case is a clean order that matches the catalogue exactly; routing it through a model adds latency, cost, and a failure mode for no benefit. | Call a model for every document and trust its confidence; run deterministic gates first and call the optional judge only for a held line. | `decide` runs the gates first and emits `decide.shortcircuit` with `modelCalls: 0` when every line matches; the judge runs only for a held line. | Two decision paths to keep tested, and the judge seam stays unexercised by the demo. | A fully matched run calls the judge or emits a model call, or `decide.shortcircuit` is missing from its log. | `git revert 323c8bc` restores the pre-gate decision path. |
| [0004](0004-verify-after-posting.md) Verify after posting | A successful write is not proof that the value is still there or still correct; stores lose records and out-of-band edits happen after the post returns. | Verify synchronously inside `post`; run a delayed `verify` pass that compares posted keys with the latest store revision. | `npm run verify` reads `post.written` keys, compares each with the latest revision, and reports `ok`, `missing`, or `drift`. | It compares against the local store only; a remote adapter must add its own read-back, and the limitation is stated wherever verification is described. | `verify` reports `ok` for a key the store no longer holds or holds with a different value, or reports drift for an unchanged record. | `git revert be9f17e` (also removes 0002's evidence invariant). |

## Notebook notes

```bash
npm run docs:decisions -- --vault ~/book-work
```

The generator writes one note per row as `adr-<id>-<slug>.md`. Each note carries
`type: adr`, `created` from the ADR's `Date`, `sensitivity: internal`, `refs` for
the repository and the ADR, and `generated: docs/decisions/README.md`.

The generator refuses to overwrite a note that lacks a matching `generated:`
line, so a hand-written note is never replaced. Raise the sensitivity with
`--sensitivity` when a row is redacted; never lower it. The vault's tier gate
still decides whether the note may be written.
