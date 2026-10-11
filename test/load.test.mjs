import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "../src/load.mjs";
import { readToken } from "../src/datum.mjs";
import { moldDatum, moldItems } from "../src/mold.mjs";
import { readGolden } from "./golden.edge.mjs";

/**
 * @uses loadSource (src/load.mjs), moldItems (src/mold.mjs)
 * @usedby findProblems
 */
const moldSource = (source) => {
  // REBOL shows an error as its type and its id.
  const loaded = loadSource(source);
  return loaded.type === "error" ? `! ${loaded.value}` : moldItems(loaded.value);
};

/**
 * @uses readGolden, moldSource
 */
const findProblems = (name) =>
  readGolden(name)
    .filter((entry) => moldSource(entry.source) !== entry.expected)
    .map((entry) => `${entry.source} gives ${moldSource(entry.source)}, not ${entry.expected}`);

test("loadSource reference: the number cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("number.txt"), []);
});

test("loadSource reference: the string and char cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("string.txt"), []);
});

test("loadSource reference: the word, block and path cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("word.txt"), []);
});

test("loadSource reference: the time, pair, tuple and binary cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("scalar.txt"), []);
});

test("loadSource reference: the issue, file, email, url and tag cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("text.txt"), []);
});

test("loadSource reference: the error cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("error.txt"), []);
});

test("loadSource missing: a block without its end gives the error", () => {
  assert.deepEqual(loadSource("[a"), { type: "error", value: "syntax missing" });
});

test("readToken invalid: a number with a letter gives the error", () => {
  assert.deepEqual(readToken({ kind: "run", text: "1a" }), { type: "error", value: "syntax invalid" });
});

test("moldDatum reference: a decimal of 16 digits shows 15 digits and an exponent", () => {
  assert.equal(moldDatum({ type: "decimal", value: 1234567890123456 }), "1.23456789012346E+15");
});

test("moldItems reference: a space divides the values", () => {
  assert.equal(moldItems(loadSource("1 [a] {b}").value), '1 [a] "b"');
});
