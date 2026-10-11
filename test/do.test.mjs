import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretSource, showResult } from "../src/natives/interpret.mjs";
import { readGolden } from "./golden.edge.mjs";

const BATCHES = 2000;

/**
 * @uses interpretSource (src/natives/interpret.mjs), BATCHES, showResult (src/natives/interpret.mjs)
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
