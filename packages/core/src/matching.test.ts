import test from "node:test";
import assert from "node:assert/strict";
import { classify, normalise, trigramScore } from "./matching.js";

test("normalise folds case, accents and punctuation", () => {
  assert.equal(normalise("Kōwhai  Weave, 4417"), "kowhai weave 4417");
});

test("identical names score 1", () => {
  assert.equal(trigramScore("aurelia weave", "aurelia weave"), 1);
});

test("disjoint names score 0", () => {
  assert.equal(trigramScore("aaaa", "zzzz"), 0);
});

test("classify honours the spec thresholds", () => {
  assert.equal(classify(0.82, false), "accept");
  assert.equal(classify(0.819, false), "hold");
  assert.equal(classify(0.55, false), "hold");
  assert.equal(classify(0.549, false), "reject");
  assert.equal(classify(0.1, true), "accept");
});
