# Adapters

`packages/core/src/ports.ts` declares eight interfaces. Four are the integration seams an adopter
replaces. Three support the pipeline. One is optional.

| Port | Demo | Production mapping |
|---|---|---|
| `Inbox` | folder listing and watcher | Graph, IMAP |
| `Extractor` | template and positional reader | Document Intelligence, an LLM |
| `Catalogue` | JSON with exact reference and trigram matching | ERP product master |
| `CustomerDirectory` | JSON, email then name then exact account | CRM |
| `SystemOfRecord` | JSONL append store | ERP posting API |
| `Notifier` | console | chat, email |
| `Clock` | real time | fixed time in tests |
| `EventLog` | JSONL append log | OpenTelemetry, a warehouse |

## Inbox

```ts
interface Inbox {
  list(): Promise<SourceDocument[]>;
}
```

**Contract.** Return a bounded batch of documents. A `messageId` must be stable for the same
message across calls, because the idempotency key is built from it.

**Demo.** `folder-inbox.ts` lists `fixtures/documents` sorted by name, skips dotfiles, and uses the
filename as the message id.

**Production.** A Graph delta query or an IMAP high-water mark. Enumerate a bounded set, never an
unbounded tree:

```ts
async list() {
  const page = await graph.messages.delta({ token, top: 50 });
  token = page.nextToken;          // a cursor, not a directory walk
  return page.messages.map(toSourceDocument);
}
```

**What the adopter must guarantee.** Bounded enumeration, a cursor or manifest with an explicit
completion contract, and a stable message id. A re-saved file is a new document by design; do not
normalise bytes to make retries look identical.

## Extractor

```ts
interface Extractor {
  extract(doc: SourceDocument): Promise<ExtractedDocument>;
}
```

**Contract.** Return a whole-document result with `status` of `ok`, `unreadable` or
`not-a-document`, the labelled fields, the independent identity read, and the line items. Do not
stream, and supply confidence only where the producer can honestly supply it.

**Demo.** `template-extractor.ts` reads the text layer through `pdfjs-dist`, groups items by `y`
coordinate to rebuild lines, and applies labelled-field and column rules. `identity.ts` is a second,
independent read.

**Production.** Map a Document Intelligence response onto the same shape:

```ts
async extract(doc) {
  const result = await intelligence.analyse(doc.bytes, schema);
  if (result.pages.length === 0) return unreadable();
  return {
    status: "ok",
    fields: pick(result.fields, ["purchaseOrder", "date", "deliverTo", "company"]),
    identity: await readIdentityIndependently(result.text),
    lines: result.tables.lines,
  };
}
```

**What the adopter must guarantee.** Keep the identity read independent. A second pass over the same
fields from the same engine is not a second read. A parser failure becomes `unreadable`, never an
unhandled throw.

## Catalogue

```ts
interface Catalogue {
  match(description: string): Promise<MatchResult>;
}
```

**Contract.** Return the best candidate, its score, whether it was an exact reference, and the rule
that produced the decision. Matching is deterministic and named.

**Demo.** `catalogue.ts` accepts an exact name or manufacturer reference, otherwise scores trigram
Jaccard similarity against the catalogue names.

**Production.** Look up the exact reference first, then a bounded fuzzy search:

```ts
async match(description) {
  const wanted = normalise(description);
  const exact = await erp.productByRef(wanted);
  if (exact !== undefined) return { sku: exact.sku, score: 1, exactReference: true, rule: "accept" };
  const candidates = await erp.search(wanted, { limit: 5 });
  return best(candidates).match;
}
```

**What the adopter must guarantee.** A bounded candidate set, a timeout, and a typed failure. Fail
closed: a timeout during matching is a hold, not an empty result.

## CustomerDirectory

```ts
interface CustomerDirectory {
  resolve(doc, fields, identity): Promise<ResolvedCustomer>;
}
```

**Contract.** Ambiguity is a first-class result. Return `ambiguous: true` rather than the first
match. Credit figures are cents, in the same unit as line totals.

**Demo.** `customer-directory.ts` resolves by email, then account, then normalised name. Two exact
name matches return `ambiguous`.

## SystemOfRecord

```ts
interface SystemOfRecord {
  find(key: string): Promise<PostedRecord | undefined>;
  append(record: PostedRecord): Promise<void>;
  list(): Promise<PostedRecord[]>;
}
```

**Contract.** One writer, no cross-process concurrency. `find` and `append` are the idempotency
seam, and `append` must be idempotent at the remote boundary, keyed by `idempotencyKey`.

**Demo.** `jsonl-record.ts` appends one JSON object per line and reads the file back at boot.

**Production.** Post with the key as the external id, and make the remote reject or ignore a replay:

```ts
async append(record) {
  await erp.post("/orders", {
    externalId: record.idempotencyKey,   // the remote deduplicates on this
    fields: record.fields,
    lines: record.lines,
  });
}
```

**What the adopter must guarantee.** The key survives at the remote system, retries are safe, and a
failure is a typed error, never a silent success. The demo's `verify` compares against the local
store; a remote adapter should add its own read-back check.

## Supporting ports

`Notifier` receives one line per event worth a person's attention. `Clock` is injectable so tests
fix time; never read `Date.now()` in a stage. `EventLog` is append-only and is the run store; an
adapter that ships events to a warehouse keeps that contract.

## The optional judge

```ts
interface Judge {
  merge(input: { fields: Record<string, string>; reasons: string[] }): Promise<{
    fields: Record<string, string>;
    evidence: Evidence[];
  }>;
}
```

It runs only when a line is held and a judge is configured. It returns fields plus evidence, never a
bare value. Its merged fields and evidence replace the extracted fields on a new event, and the
outcome stays `review`, so the person still decides. The demo never configures one, so the default
path makes no model call.

## What verification can and cannot say

`verifyAll` compares the event log with the local record store. It can tell you a record is missing
or drifted there. It cannot confirm that a remote system still holds the record. Do not describe it
as doing so.
