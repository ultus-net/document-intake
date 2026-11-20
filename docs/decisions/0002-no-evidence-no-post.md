# 0002: No evidence, no post

**Status:** accepted

**Date:** 2026-11-21

## Context

An intake system that posts values without a trace is impossible to audit and impossible to correct
with confidence. The usual failure is not a crash; it is a plausible wrong value in the system of
record with no way to say where it came from. Corrections make it worse when they overwrite the
value without leaving a record of the change.

## Decision

`post` builds one evidence entry per posted value, keyed by path: every field as `field:<name>`,
every line as `line:<index>:sku` and `line:<index>:quantity`. It checks each posted value against its
evidence entry, by value, and throws `IntakeError("no-evidence")` on a mismatch. Operator input is
evidence with its own source: `operator:correction`, `operator:accept`, `operator:reject`.

## Consequences

- Every posted value can name its origin.
- The invariant is enforced at one choke point, so a new field cannot silently skip it.
- A legitimate post can fail when a producer forgets evidence. That is the intended failure mode:
  loud, typed, and caught by tests.
- Accepting a held run records a decision rather than bypassing the gates. Validity still applies.

## Alternative rejected

Log evidence but do not enforce it, treating the trail as advisory. It reads the same on the happy
path and quietly loses the guarantee on the exception path, which is the only path that matters.
