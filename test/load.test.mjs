import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "../src/data/load.mjs";
import { readToken } from "../src/data/datum.mjs";
import { EMPTY_STORE, allocate } from "../src/store/store.mjs";
import { moldRest, moldValue } from "../src/store/mold.mjs";
import { readGolden } from "./golden.edge.mjs";

/**
 * @uses loadSource (src/data/load.mjs), allocate (src/store/store.mjs), EMPTY_STORE (src/store/store.mjs),
 *   moldRest (src/store/mold.mjs)
 * @usedby findProblems
 */
const moldSource = (source) => {
  // REBOL shows an error as its type and its id.
  const loaded = loadSource(source);
  if (loaded.type === "error") return `! ${loaded.value}`;
  const made = allocate(EMPTY_STORE, loaded);
  return moldRest(made.store, made.value);
};

/**
 * @uses readGolden, moldSource
 */
const findProblems = (name) =>
  readGolden(name)
    .filter((entry) => moldSource(entry.source) !== entry.expected)
    .map((entry) => `${entry.source} gives ${moldSource(entry.source)}, not ${entry.expected}`);

test("loadSource reference: the number cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("load/number.txt"), []);
});

test("loadSource reference: the string and char cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("load/string.txt"), []);
});

test("loadSource reference: the word, block and path cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("load/word.txt"), []);
});

test("loadSource reference: the time, pair, tuple and binary cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("load/scalar.txt"), []);
});

test("loadSource reference: the issue, file, email, url and tag cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("load/text.txt"), []);
});

test("loadSource reference: the error cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("load/error.txt"), []);
});

test("loadSource missing: a block without its end gives the error", () => {
  assert.deepEqual(loadSource("[a"), { type: "error", value: "syntax missing", args: ["end-of-script", "]"] });
});

test("readToken invalid: a number with a letter gives the error", () => {
  assert.deepEqual(readToken({ kind: "run", text: "1a" }), { type: "error", value: "syntax invalid", args: ["integer", "1a"] });
});

test("moldValue reference: a decimal of 16 digits shows 15 digits and an exponent", () => {
  assert.equal(moldValue(EMPTY_STORE, { type: "decimal", value: 1234567890123456 }), "1.23456789012346E+15");
});

test("moldRest reference: a space divides the values", () => {
  assert.equal(moldSource("1 [a] {b}"), '1 [a] "b"');
});
