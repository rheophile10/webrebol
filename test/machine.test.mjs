import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "../src/data/load.mjs";
import { EMPTY_STORE, UNSET, allocate, bindCopy, bindInPlace, makeRecord, readContext, readRest, readWord, writeWord } from "../src/store/store.mjs";
import { formValue } from "../src/store/mold.mjs";
import { makeMachine, startBlock, stopThrown, throwUnused, throwValue } from "../src/machine/machine.mjs";
import { evaluatePath, startSetPath } from "../src/machine/path.mjs";
import { areEqual, areSame, readOrder } from "../src/natives/compare.mjs";
import { guardSeries, makeContent, pickItem } from "../src/natives/series.mjs";
import { readPart } from "../src/natives/edit.mjs";
import { hasBit } from "../src/natives/bitsets.mjs";
import { failSyntax } from "../src/natives/control.mjs";
import { acceptsType, parseSpec } from "../src/machine/spec.mjs";
import { callFunction, startCall, stepLook } from "../src/machine/call.mjs";
import { bindLoop, startEach } from "../src/natives/loops.mjs";
import { evaluateOperand } from "../src/machine/evaluate.mjs";
import { runMachine, stepMachine } from "../src/machine/run.mjs";
import { startReduce } from "../src/natives/control.mjs";
import { START_STORE } from "../src/natives/globals.mjs";
import { interpretSource, showResult } from "../src/natives/interpret.mjs";
import { findError, formatError } from "../src/natives/report.mjs";

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
const readGlobal = (name) => START_STORE.base[`$${name}`];

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
  const machine = startCall(makeReady("1 2"), readGlobal("break"), { names: ["$return"], label: "break" });
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
  assert.equal(showResult(interpretSource("[1", BATCHES)), '! syntax missing "end-of-script" "]" none');
});

test("showResult error: a division by zero shows the type and the id", () => {
  assert.equal(showResult(interpretSource("1 / 0", BATCHES)), "! math zero-divide none none none");
});

test("bindInPlace same: the block keeps its series number and its words get the context", () => {
  const made = allocate(EMPTY_STORE, loadSource("abc [abc]"));
  const store = bindInPlace(made.store, made.value, { id: 9, keys: ["$abc"] });
  const items = readRest(store, made.value);
  assert.equal(items[0].bind, 9);
  assert.equal(readRest(store, items[1])[0].bind, 9);
});

test("stopThrown other: a frame that stops a break lets an error continue", () => {
  const machine = { ...makeReady("1"), frames: { top: {}, below: null } };
  const stopped = stopThrown("break")(throwValue(machine, "break", UNSET), { cursor: null });
  const passed = stopThrown("break")(throwValue(machine, "error", UNSET), { cursor: null });
  assert.equal(stopped.thrown, null);
  assert.equal(passed.thrown.kind, "error");
});

test("evaluatePath invalid: a word that the block does not have gives the error", () => {
  const made = allocate(START_STORE, loadSource("[abc 1] items/zzz"));
  const [block, path] = readRest(made.store, made.value);
  const store = writeWord(made.store, { type: "word", value: "items", bind: 0 }, block);
  assert.equal(evaluatePath(makeMachine(store, made.value), path).thrown.value.value, "script invalid-path");
});

test("startSetPath range: a number after the end of the block gives the error", () => {
  assert.equal(showResult(interpretSource("items: [1 2] items/5: 9", BATCHES)), "! script out-of-range 5 none none");
  assert.equal(startSetPath(makeReady("1"), UNSET).mode, "next");
});

test("areEqual case: two words with different case are equal", () => {
  const left = { type: "word", value: "abc" };
  assert.equal(areEqual(EMPTY_STORE, left, { type: "word", value: "ABC" }), true);
});

test("makeContent splice: a block gives its items, and with only it is one item", () => {
  const made = allocate(EMPTY_STORE, loadSource("[1] [2 3]"));
  const pair = readRest(made.store, made.value);
  assert.equal(makeContent(made.store, pair, false).length, 2);
  assert.equal(makeContent(made.store, pair, true).length, 1);
});

test("makeRecord self: the word self of the object gives the object", () => {
  const made = makeRecord(EMPTY_STORE, ["abc"], [UNSET]);
  assert.deepEqual(readContext(made.store, made.value.value.context).$self, made.value);
});

test("areSame strict: two texts with different case are not the same", () => {
  const made = allocate(EMPTY_STORE, loadSource('"abc" "ABC"'));
  const [left, right] = readRest(made.store, made.value);
  assert.equal(areSame(made.store, left, right), false);
  assert.equal(areEqual(made.store, left, right), true);
});

test("readOrder none: a block has no order", () => {
  const made = allocate(EMPTY_STORE, loadSource("[1]"));
  assert.equal(readOrder(made.store, readRest(made.store, made.value)[0]), null);
});

test("failSyntax fields: the texts of the loader are the first two fields of the error", () => {
  const machine = failSyntax(makeReady("1"), loadSource("[1"));
  assert.equal(machine.thrown.value.args.length, 2);
  assert.equal(readRest(machine.store, machine.thrown.value.args[1]), "]");
});

test("readPart position: a position gives the distance from the series", () => {
  const series = { type: "block", value: { id: 1, index: 1 } };
  assert.equal(readPart(series, { type: "block", value: { id: 1, index: 4 } }), 3);
  assert.equal(readPart(series, { type: "integer", value: 2 }), 2);
});

test("pickItem outside: an offset after the end gives null", () => {
  const made = allocate(EMPTY_STORE, loadSource("1 2"));
  assert.equal(pickItem(made.store, made.value, 5), null);
  assert.equal(pickItem(made.store, made.value, 1).value, 2);
});

test("guardSeries guard: a first argument that is not a series gives the error", () => {
  const guarded = guardSeries({ sample: (machine) => machine });
  const machine = guarded.sample(makeReady("1"), [UNSET], {});
  assert.equal(machine.thrown.value.value, "script expect-arg");
});

test("formatError header: a word without a value gives a Script Error", () => {
  const machine = interpretSource("zzz", BATCHES);
  const message = formatError(machine.store, findError(machine));
  assert.equal(message, '** Script Error: The word "zzz" has no value. Set the word before you use it. (script no-value)');
});

test("formatError identity: an id without a message shows the type, the id and the fields", () => {
  const message = formatError(EMPTY_STORE, { type: "error", value: "access timeout", args: [] });
  assert.match(message, /^\*\* Access Error: .*Fields: none none none \(access timeout\)$/);
});

test("findError result: an error value that is the result is the error", () => {
  assert.equal(findError(interpretSource("try [1 / 0]", BATCHES)).value, "math zero-divide");
  assert.equal(findError(interpretSource("1", BATCHES)), null);
});

test("hasBit limit: a code above 255 is not in a bitset", () => {
  const full = { type: "bitset", value: Array.from({ length: 32 }).map(() => 255) };
  assert.equal(hasBit(full, 97), true);
  assert.equal(hasBit(full, 300), false);
});

test("callFunction checked: an argument of a wrong type gives the error of a usual call", () => {
  const call = { names: [], args: [{ type: "none", value: null }, UNSET], label: "add" };
  assert.equal(callFunction(makeReady("1"), readGlobal("add"), call).thrown.value.value, "script expect-arg");
});

test("bindLoop local: the word of the loop gets a context that is not the global context", () => {
  const made = allocate(START_STORE, loadSource("item [item]"));
  const [word, body] = readRest(made.store, made.value);
  const bound = bindLoop(makeMachine(made.store, made.value), [word], body);
  assert.notEqual(bound.words[0].bind, 0);
  assert.equal(readRest(bound.machine.store, bound.body)[0].bind, bound.words[0].bind);
});

test("startEach sequence: the results are in the sequence of the groups", () => {
  const made = allocate(START_STORE, loadSource("item [item]"));
  const [word, body] = readRest(made.store, made.value);
  const bound = bindLoop(makeMachine(made.store, made.value), [word], body);
  const values = [[{ type: "integer", value: 7 }], [{ type: "integer", value: 8 }]];
  const keep = (machine, results) => ({ ...machine, kept: results.map((result) => result.value) });
  const machine = startEach(bound.machine, { words: bound.words, body: bound.body, values }, keep);
  assert.deepEqual(runMachine(machine, BATCHES).kept, [7, 8]);
});
