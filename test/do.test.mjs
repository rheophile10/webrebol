import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretSource, showResult } from "../src/session/interpret.mjs";
import { readGolden } from "./golden.edge.mjs";

const BATCHES = 2000;

/**
 * @uses interpretSource (src/session/interpret.mjs), BATCHES, showResult (src/session/interpret.mjs)
 * @usedby findProblems
 */
const showRun = (source) => {
  // Show the result and the printed text in the same form as the recorded case.
  const machine = interpretSource(source, BATCHES);
  return `${showResult(machine)} | ${machine.store.output}`;
};

/**
 * @uses readGolden, showRun
 */
const findProblems = (name) =>
  readGolden(name)
    .filter((entry) => showRun(entry.source) !== `${entry.expected} | ${entry.output}`)
    .map((entry) => `${entry.source} gives ${showRun(entry.source)}, not ${entry.expected} | ${entry.output}`);

test("interpretSource reference: the arithmetic cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/math.txt"), []);
});

test("interpretSource reference: the comparison and type cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/compare.txt"), []);
});

test("interpretSource reference: the control cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/control.txt"), []);
});

test("interpretSource reference: the function cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/function.txt"), []);
});

test("interpretSource reference: the series cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/series.txt"), []);
});

test("interpretSource reference: the text and print cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/text.txt"), []);
});

test("interpretSource reference: the object cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/object.txt"), []);
});

test("interpretSource reference: the path and set-path cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/path.txt"), []);
});

test("interpretSource reference: the word and binding cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/word.txt"), []);
});

test("interpretSource reference: the any, all, switch, case, catch and compose cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/flow.txt"), []);
});

test("interpretSource reference: the for, forall, forever and foreach cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/loop.txt"), []);
});

test("interpretSource reference: the find, select, change and remove cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/change.txt"), []);
});

test("interpretSource reference: the join, reform and conversion cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/join.txt"), []);
});

test("interpretSource reference: the error object cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/fault.txt"), []);
});

test("interpretSource reference: the cases of copy, insert, change and remove with refinements agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/part.txt"), []);
});

test("interpretSource reference: the find, sort, set and replace cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/search.txt"), []);
});

test("interpretSource reference: the trim and case cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/string.txt"), []);
});

test("interpretSource reference: the cases of the other number functions agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/number.txt"), []);
});

test("interpretSource reference: the parse cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/parse.txt"), []);
});

test("interpretSource reference: the bitset cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/bitset.txt"), []);
});

test("interpretSource reference: the char, time, pair, tuple, money and date cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/scalar.txt"), []);
});

test("interpretSource reference: the cases of the type predicates, the conversions and more functions agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/more.txt"), []);
});

test("interpretSource reference: the file and folder cases agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/file.txt"), []);
});

test("interpretSource reference: the cases of the properties of random agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("do/random.txt"), []);
});

test("interpretSource reference: the layout cases agree with REBOL View 2.7.8", () => {
  assert.deepEqual(findProblems("view/layout.txt"), []);
});
