# 0003: Short-circuit before any model call

**Status:** accepted

**Date:** 2026-11-21

## Context

The common case is a clean order whose lines match the catalogue exactly. Routing that case through
a model adds latency, cost and a new failure mode for no benefit. It also makes the template look
like a model wrapper rather than an intake pipeline. At the same time, a model is genuinely useful
for the ambiguous remainder, so removing the seam entirely would be an overcorrection.

## Decision

`decide` runs deterministic gates first. When every line matches and no gate holds, the run posts
automatically and emits `decide.shortcircuit` with `modelCalls: 0`. The optional `Judge` port is
called only when a line is held and a judge is configured. The run detail renders the short-circuit
as one line: *no model calls*.

## Consequences

- The default path is fast, offline and deterministic.
- The UI makes the short-circuit visible, so the claim is observable rather than implied.
- The judge seam exists but is never invoked by the demo, which keeps the "no provider is
  load-bearing" claim literal.
- A held line is the only place a model may run, so model output always arrives with a human
  decision around it.

## Alternative rejected

Call a model for every document and use its confidence to decide. It hides the deterministic rules,
inflates the cost of the common case, and makes the hold band a prompt-tuning problem instead of a
tested constant.
