# 0001: Local-first vertical slice

**Status:** accepted

**Date:** 2026-11-21

## Context

The template has to be readable and runnable by two audiences: an engineer deciding whether the
architecture is sound, and a hiring manager deciding whether the author can ship. Anything that
requires an account, a key, or a cloud deployment loses one of those audiences at the first step.
A hosted demo also decays: keys expire, quotas run out, and the reviewer cannot see the code path
that matters.

## Decision

Ship one vertical slice that runs on a laptop with `npm ci` followed by `npm run demo`. Every port
has a local implementation: a folder inbox, a template extractor, JSON catalogue and customer data,
a JSONL record store, a console notifier and a JSONL event log. The demo has no network call in its
default path.

## Consequences

- The reviewer reaches the interesting screen in under a minute.
- The architecture is demonstrated by the code, not by a deployment.
- The trade-off is breadth: one document shape, six fixtures, no OCR, no multi-tenant concerns.
- Adopters replace adapters, not the pipeline, and `docs/adapters.md` names what each must preserve.

## Alternative rejected

A hosted demo with a live model and a seeded cloud store. It would show extraction quality on real
documents, but it would hide the gate logic behind a service, require credentials, and break the
one-command promise.
