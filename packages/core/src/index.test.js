import test from "node:test";
import assert from "node:assert/strict";
import { VERSION } from "./index.js";
test("exports a version", () => assert.equal(VERSION, "0.1.0"));
