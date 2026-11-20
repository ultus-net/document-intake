import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { SourceError, generate, main } from "./decisions.mjs";

const INDEX = `# Decision index

The source for the generated documents.

| ADR | Problem | Options | Decision | Cost | Falsification signal | Undo |
|---|---|---|---|---|---|---|
| [0001](0001-alpha.md) Alpha choice | Problem one | Option one | Decision one | Cost one | Falsifier one | \`git revert aaa\` |
| [0002](0002-beta.md) Beta choice | Problem two | Option two | Decision two | Cost two | Falsifier two | \`git revert bbb\` |
`;

function adr(id, title, date = "2026-01-02") {
  return `# ${id}: ${title}

**Status:** accepted

**Date:** ${date}

## Context

Fixture context.

## Decision

Fixture decision.
`;
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "decisions-"));
  const decisions = join(root, "docs/decisions");
  mkdirSync(decisions, { recursive: true });
  writeFileSync(join(decisions, "README.md"), INDEX);
  writeFileSync(join(decisions, "0001-alpha.md"), adr("0001", "Alpha choice"));
  writeFileSync(join(decisions, "0002-beta.md"), adr("0002", "Beta choice", "2026-02-03"));
  return root;
}

function vault(root) {
  const path = join(root, "vault");
  mkdirSync(path);
  return path;
}

test("renders one teaching section per row in field order", () => {
  const root = fixture();

  generate(root);

  const text = readFileSync(join(root, "docs/why-this-shape.md"), "utf8");
  assert.match(text, /^# Why this shape\n/);
  assert.match(text, /Verification limit: `npm run verify` compares each posted key with the local record store\./);
  assert.match(
    text,
    /## 0001: Alpha choice\n\n\*\*Problem:\*\* Problem one\n\n\*\*Options:\*\* Option one\n\n\*\*Decision:\*\* Decision one\n\n\*\*Cost:\*\* Cost one\n\n\*\*Falsification signal:\*\* Falsifier one\n\n\*\*Undo:\*\* `git revert aaa`/,
  );
  assert.equal(text.match(/^## /gm)?.length, 2);
});

test("writes one note per row with the unified schema", () => {
  const root = fixture();
  const notes = vault(root);

  generate(root, { vault: notes });

  const text = readFileSync(join(notes, "adr-0001-alpha.md"), "utf8");
  assert.match(text, /^---\ntitle: "0001: Alpha choice"\ntype: adr\ncreated: 2026-01-02\nsensitivity: internal\nrefs:\n  - repo:document-intake\n  - adr:docs\/decisions\/0001-alpha\.md\ngenerated: docs\/decisions\/README\.md\n---\n/);
  assert.match(
    text,
    /## Context\n\n\*\*Problem:\*\* Problem one\n\n\*\*Options:\*\* Option one\n\n## Observation\n\nThe evidence and the rejected alternative live in `docs\/decisions\/0001-alpha\.md`\.\n\n## Decision\n\nDecision one\n\n## Consequence\n\n\*\*Cost:\*\* Cost one\n\n## Rollback\n\nFalsifier: Falsifier one\n\nUndo: `git revert aaa`\n$/,
  );
  for (const heading of ["Context", "Observation", "Decision", "Consequence", "Rollback"]) {
    assert.equal(text.match(new RegExp(`^## ${heading}$`, "gm"))?.length, 1);
  }
  assert.match(readFileSync(join(notes, "adr-0002-beta.md"), "utf8"), /created: 2026-02-03/);
});

test("a second run changes nothing", () => {
  const root = fixture();
  const notes = vault(root);
  generate(root, { vault: notes });
  const teaching = readFileSync(join(root, "docs/why-this-shape.md"), "utf8");
  const note = readFileSync(join(notes, "adr-0001-alpha.md"), "utf8");

  generate(root, { vault: notes });

  assert.equal(readFileSync(join(root, "docs/why-this-shape.md"), "utf8"), teaching);
  assert.equal(readFileSync(join(notes, "adr-0001-alpha.md"), "utf8"), note);
});

test("check reports a stale document and writes nothing", () => {
  const root = fixture();
  generate(root);
  const path = join(root, "docs/why-this-shape.md");
  writeFileSync(path, readFileSync(path, "utf8").replace("Decision one", "Old decision"));

  const result = generate(root, { check: true });

  assert.equal(result.ok, false);
  assert.equal(result.teachingChanged, true);
  assert.match(readFileSync(path, "utf8"), /Old decision/);
});

test("check passes once the documents match the index", () => {
  const root = fixture();
  const notes = vault(root);

  generate(root, { vault: notes });

  assert.deepEqual(generate(root, { check: true, vault: notes }), {
    ok: true,
    teachingChanged: false,
    staleNotes: [],
  });
});

test("check reports a missing note", () => {
  const root = fixture();
  const notes = vault(root);

  const result = generate(root, { check: true, vault: notes });

  assert.equal(result.ok, false);
  assert.deepEqual(result.staleNotes, [
    join(notes, "adr-0001-alpha.md"),
    join(notes, "adr-0002-beta.md"),
  ]);
});

test("refuses to overwrite a hand-written note", () => {
  const root = fixture();
  const notes = vault(root);
  const path = join(notes, "adr-0001-alpha.md");
  writeFileSync(path, "# My own note\n");

  assert.throws(() => generate(root, { vault: notes }), SourceError);
  assert.equal(readFileSync(path, "utf8"), "# My own note\n");
});

test("refuses to overwrite a note generated from another source", () => {
  const root = fixture();
  const notes = vault(root);
  const path = join(notes, "adr-0001-alpha.md");
  writeFileSync(path, "---\ngenerated: docs/other.md\n---\n# Other\n");

  assert.throws(() => generate(root, { vault: notes }), SourceError);
  assert.match(readFileSync(path, "utf8"), /generated: docs\/other\.md/);
});

test("refuses a symlinked note", () => {
  const root = fixture();
  const notes = vault(root);
  const target = join(root, "outside.md");
  writeFileSync(target, "# Outside\n");
  symlinkSync(target, join(notes, "adr-0001-alpha.md"));

  assert.throws(() => generate(root, { vault: notes }), SourceError);
  assert.equal(readFileSync(target, "utf8"), "# Outside\n");
});

test("refuses an ADR with no row", () => {
  const root = fixture();
  writeFileSync(join(root, "docs/decisions/0003-gamma.md"), adr("0003", "Gamma choice"));

  assert.throws(() => generate(root), /0003-gamma\.md has no row/);
});

test("refuses a row that links a missing ADR", () => {
  const root = fixture();
  rmSync(join(root, "docs/decisions/0002-beta.md"));
  writeFileSync(
    join(root, "docs/decisions/README.md"),
    INDEX.replace(
      "| [0002](0002-beta.md) Beta choice",
      "| [0009](0009-missing.md) Missing choice",
    ),
  );

  assert.throws(() => generate(root), /links a missing ADR: 0009-missing\.md/);
});

test("refuses an ADR whose heading disagrees with the index", () => {
  const root = fixture();
  writeFileSync(join(root, "docs/decisions/0001-alpha.md"), adr("0001", "Different choice"));

  assert.throws(() => generate(root), /heading is "0001: Different choice"/);
});

test("refuses an ADR with no date", () => {
  const root = fixture();
  writeFileSync(join(root, "docs/decisions/0001-alpha.md"), adr("0001", "Alpha choice").replace(/\*\*Date:\*\*.*\n\n/, ""));

  assert.throws(() => generate(root), /has no \*\*Date:\*\*/);
});

test("refuses an unknown sensitivity", () => {
  const root = fixture();
  const notes = vault(root);

  assert.throws(() => generate(root, { vault: notes, sensitivity: "secret" }), /unknown sensitivity/);
});

test("main exits 1 for a stale check and 0 for a match", () => {
  const root = fixture();

  assert.equal(main(["--check"], root), 1);
  generate(root);
  assert.equal(main(["--check"], root), 0);
  assert.equal(main(["--bogus"], root), 2);
});
