import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "../src/data/load.mjs";
import { EMPTY_STORE, UNSET, allocate, bindCopy, readRest, readWord } from "../src/store/store.mjs";
import { formValue } from "../src/store/mold.mjs";
import { makeMachine, startBlock, throwUnused } from "../src/machine/machine.mjs";
import { acceptsType, parseSpec } from "../src/machine/spec.mjs";
import { startCall, stepLook } from "../src/machine/call.mjs";
import { evaluateOperand } from "../src/machine/evaluate.mjs";
import { runMachine, stepMachine } from "../src/machine/run.mjs";
import { startReduce } from "../src/natives/control.mjs";
import { START_STORE } from "../src/natives/globals.mjs";
import { interpretSource, showResult } from "../src/natives/interpret.mjs";

const BATCHES = 100;

/**
 * @uses allocate (src/store/store.mjs), START_STORE (src/natives/globals.mjs), loadSource (src/data/load.mjs),
 *   makeMachine (src/machine/machine.mjs)
 */
const makeReady = (source) => {
  // Make a machine with the source as its block, before the first step.
  const made = allocate(START_STORE, loadSource(source));
  return makeMachine(made.store, made.value);
};

/**
 * @uses START_STORE (src/natives/globals.mjs)
 */
const readGlobal = (name) => START_STORE.contexts[0][`$${name}`];

test("readWord unset: a word that no code set gives the unset value", () => {
  assert.deepEqual(readWord(EMPTY_STORE, { type: "word", value: "abc", bind: 0 }), UNSET);
});

test("bindCopy original: the words of the first block keep the global context", () => {
  const made = allocate(EMPTY_STORE, loadSource("abc [abc]"));
  const copied = bindCopy(made.store, made.value, { id: 9, keys: ["$abc"] });
  assert.equal(readRest(copied.store, made.value)[0].bind, 0);
  assert.equal(readRest(copied.store, copied.value)[0].bind, 9);
});

test("formValue reference: the items of a block are joined with a space", () => {
  const made = allocate(EMPTY_STORE, loadSource('1 "two" [three]'));
  assert.equal(formValue(made.store, made.value), "1 two three");
});

test("startBlock empty: an empty block gives the unset value", () => {
  const made = allocate(START_STORE, loadSource("5 []"));
  const machine = startBlock(makeMachine(made.store, made.value), readRest(made.store, made.value)[1]);
  assert.deepEqual(machine.value, UNSET);
  assert.equal(machine.mode, "give");
});

test("throwUnused error: an error value before the end of a block is thrown", () => {
  const machine = { ...makeReady("1 2"), value: { type: "error", value: "math overflow" } };
  assert.equal(throwUnused(machine).mode, "throw");
  assert.equal(throwUnused({ ...machine, value: UNSET }), null);
});

test("parseSpec groups: a parameter after a refinement belongs to the refinement", () => {
  const spec = parseSpec(loadSource("first /extra second").value);
  assert.deepEqual(spec.params.map((param) => param.key), ["$first"]);
  assert.deepEqual(spec.refinements[0].params.map((param) => param.key), ["$second"]);
});

test("acceptsType unset: a parameter without types does not accept the unset value", () => {
  assert.equal(acceptsType(null, UNSET), false);
  assert.equal(acceptsType(null, { type: "integer", value: 1 }), true);
});

test("startCall refinements: the argument of a refinement comes after the usual arguments", () => {
  const machine = startCall(makeReady("1 2"), readGlobal("break"), ["$return"]);
  assert.deepEqual(machine.frames.top.order.map((param) => param.key), ["$value"]);
});

test("stepLook sequence: 1 + 2 * 3 gives 9", () => {
  assert.equal(showResult(interpretSource("1 + 2 * 3", BATCHES)), "9");
  assert.equal(stepLook({ ...makeReady(""), frames: { top: {}, below: null } }).frames, null);
});

test("evaluateOperand end: the end of a block gives the unset value", () => {
  assert.deepEqual(evaluateOperand(makeReady("")).value, UNSET);
});

test("stepMachine done: a machine that is done does not change", () => {
  const machine = runMachine(makeReady("1"), BATCHES);
  assert.equal(stepMachine(machine), machine);
});

test("runMachine budget: a loop without an end stops with a mode that is not done", () => {
  assert.notEqual(runMachine(makeReady("while [true] []"), 2).mode, "done");
});

test("startReduce sequence: the results are in the sequence of the expressions", () => {
  const made = allocate(START_STORE, loadSource("1 + 1 3"));
  const keep = (machine, values) => ({ ...machine, kept: values.map((value) => value.value) });
  const machine = startReduce(startBlock(makeMachine(made.store, made.value), made.value), made.value, keep);
  assert.deepEqual(runMachine(machine, BATCHES).kept, [2, 3]);
});

test("interpretSource syntax: a block without its end gives the error of the loader", () => {
  assert.equal(showResult(interpretSource("[1", BATCHES)), "! syntax missing");
});

test("showResult error: a division by zero shows the type and the id", () => {
  assert.equal(showResult(interpretSource("1 / 0", BATCHES)), "! math zero-divide");
});
