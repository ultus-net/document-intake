# 0004: Verify after posting

**Status:** accepted

## Context

A successful write is not proof that the value is still there, or that it is still the value that
was written. Stores lose records, out-of-band edits happen, and a post that returned success can be
followed by a change nobody recorded. An intake system that stops at the write has no way to notice.

## Decision

`npm run verify` reads `post.written` keys from the event log, selects those older than a threshold,
and compares each with the latest revision in the record store. A key the store no longer holds is
`missing`. A value that differs from its evidence is `drift`. Otherwise the result is `ok`.

## Consequences

- The check is a delayed pass, not part of the ingest path, so a slow store cannot block intake.
- It compares against the local store and says so. It does not confirm that a remote system still
  holds the record; a remote adapter should add its own read-back.
- Taking the latest revision per key catches an out-of-band append instead of averaging it away.

## Alternative rejected

Verify synchronously inside `post`. It would double the writes on the happy path, couple intake
availability to the store's read path, and still not catch drift that happens after the request
returns.
