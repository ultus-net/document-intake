# Why this shape

Most document intake demos optimise for the happy path: a clean PDF, an LLM, a JSON blob, a green
checkmark. That is not the hard part. The hard part is what happens when the document is a scan, a
statement, a supplier's letterhead, or a line the catalogue almost recognises. Production intake
fails on the exceptions, and the exceptions are exactly where an automatic system is most confident
and least right.

The shape here follows from one rule: an uncertain document waits for a person, and every posted
value can name its evidence. Everything else is a consequence.

## The pipeline is five small stages

`ingest`, `extract`, `resolve`, `decide`, `post`. Each one is a function with an explicit input and
output, and each one writes an event. A stage that cannot produce a value does not invent one. The
decision stage owns the gates, so the rules that hold a document live in one readable file rather
than scattered through prompts.

The event log is the run store. The UI reads the log, the accept path reads the log, and the
projection rebuilds a run from the log after a restart. Nothing in the screen can disagree with the
audit trail, because they are the same data.

## The document is read twice

A single extractor can be wrong in a way that looks right. A second, independent read of the
document's identity catches the case the first read missed, such as a page printed on the supplier's
letterhead but sent by the customer. Two reads that disagree are a hold, not a tiebreak. The
letterhead fixture exists because that claim has to be testable, not aspirational.

## Matching is deterministic and named

Exact references accept. Otherwise a trigram score accepts at `0.82`, holds from `0.55` to `0.82`,
and rejects below. The numbers are constants. The fixtures sit either side of the band, so the
threshold behaviour is a test rather than a tuning session. A named rule can be argued with; a
model's confidence score cannot.

## The model is optional by construction

The extractor is a port, and the judge is a separate, optional port. The demo configures neither a
model nor a key. Automatic posting is the short-circuit: every line matched, so the gates cleared,
and the run detail says *no model calls*. The interesting run is the held one, where a person sees
the reason and the evidence and makes a decision.

This keeps the claim honest. The template shows an architecture where a model can be added, not one
where a model is load-bearing. Swapping in Document Intelligence or an LLM changes an adapter, not
the pipeline.

## Accepting is not bypassing

Accepting a held run records the person's decision as evidence and re-checks the gates. It cannot
turn an unreadable document into a record, and it cannot skip the evidence check. A correction is
evidence too, with its own source. The audit trail therefore reads like an account of what happened,
including who decided what and why.

## Verification is the last lesson

A successful post is not proof. `verify` re-reads the log and compares each posted key with the
record store, reporting `ok`, `missing` or `drift`. It compares against the local store and says so.
That is deliberate: the habit worth copying is to check after writing, and to be precise about what
the check covers.

## What is deliberately absent

No microservices, no queue product, no workflow engine, no cloud account. The demo is single-process
and the state is JSON lines. Those are commodity choices for a template. The part worth carrying
into a real system is the contract: bounded inputs, named rules, evidence before posting, and a
person in front of anything uncertain.
