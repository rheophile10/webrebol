import { NONE, makeSeries, readRest } from "../store/store.mjs";
import { advance, atEnd, giveValue, isTrue, makeLogic, popFrame, pushFrame, readItem, replaceTop, startBlock, stopThrown, throwValue } from "../machine/machine.mjs";
import { areEqual } from "./compare.mjs";

/**
 * @uses giveValue (src/machine/machine.mjs), popFrame (src/machine/machine.mjs)
 * @usedby stepScan, testNext, stepCase, testAfter
 */
const finishScan = (machine, frame, value) => giveValue({ ...popFrame(machine), cursor: frame.cursor }, value);

/**
 * @uses isTrue (src/machine/machine.mjs), finishScan, NONE (src/store/store.mjs), atEnd (src/machine/machine.mjs)
 * @usedby scan
 */
const stepScan = (machine, frame) => {
  // `any` stops at the first true value. `all` stops at the first value that is not true.
  if (isTrue(machine.value) === frame.stops) return finishScan(machine, frame, frame.stops ? machine.value : NONE);
  if (atEnd(machine)) return finishScan(machine, frame, frame.stops ? NONE : machine.value);
  return { ...machine, mode: "next" };
};

/**
 * @uses stepScan, NONE (src/store/store.mjs), makeLogic (src/machine/machine.mjs),
 *   pushFrame (src/machine/machine.mjs)
 * @usedby FLOW_NATIVES
 */
const scan = (stops) => (machine, [block]) => {
  // The first value is the result of an empty block.
  const frame = { step: stepScan, stops, cursor: machine.cursor };
  const first = stops ? NONE : makeLogic(true);
  return stepScan({ ...pushFrame(machine, frame), cursor: { ...block.value }, value: first }, frame);
};

/**
 * @uses readRest (src/store/store.mjs), areEqual, giveValue (src/machine/machine.mjs), NONE (src/store/store.mjs),
 *   startBlock (src/machine/machine.mjs)
 * @usedby FLOW_NATIVES
 */
const switchValue = (machine, [value, cases, fallback]) => {
  // The first block after the equal value is the block to evaluate.
  const items = readRest(machine.store, cases);
  const place = items.findIndex((item) => areEqual(machine.store, item, value));
  const found = place < 0 ? undefined : items.slice(place + 1).find((item) => item.type === "block");
  const block = found ?? fallback;
  return block === undefined ? giveValue(machine, NONE) : startBlock(machine, block);
};

/**
 * @uses atEnd (src/machine/machine.mjs), finishScan, NONE (src/store/store.mjs)
 * @usedby stepCase, chooseCase
 */
const testNext = (machine, frame) => (atEnd(machine) ? finishScan(machine, frame, NONE) : { ...machine, mode: "next" });

/**
 * @uses makeLogic (src/machine/machine.mjs), testAfter, replaceTop (src/machine/machine.mjs),
 *   atEnd (src/machine/machine.mjs), finishScan, NONE (src/store/store.mjs), readItem (src/machine/machine.mjs),
 *   isTrue (src/machine/machine.mjs), testNext, advance (src/machine/machine.mjs),
 *   startBlock (src/machine/machine.mjs)
 * @usedby chooseCase
 */
const stepCase = (machine, frame) => {
  // The value is the result of a block, or it is a condition with its block at the cursor.
  // With /all, the conditions after a true condition are also examined. The result is the result of the last block.
  // A block without a result gives true, as in REBOL.
  const result = machine.value.type === "unset" ? makeLogic(true) : machine.value;
  if (frame.running && frame.all) return testAfter(replaceTop(machine, { ...frame, running: false, last: result }));
  if (frame.running || atEnd(machine)) return finishScan(machine, frame, frame.running ? result : (frame.last ?? NONE));
  const block = readItem(machine);
  if (!isTrue(machine.value)) return testNext(advance(machine), frame);
  // A value that is not a block is the result.
  if (block.type !== "block" && frame.all) return testAfter(replaceTop(advance(machine), { ...frame, last: block }));
  if (block.type !== "block") return finishScan(advance(machine), frame, block);
  return startBlock(replaceTop(advance(machine), { ...frame, running: true }), block);
};

/**
 * @uses atEnd (src/machine/machine.mjs), finishScan
 * @usedby stepCase
 */
const testAfter = (machine) => {
  const frame = machine.frames.top;
  return atEnd(machine) ? finishScan(machine, frame, frame.last) : { ...machine, mode: "next" };
};

/**
 * @uses stepCase, testNext, pushFrame (src/machine/machine.mjs)
 * @usedby FLOW_NATIVES
 */
const chooseCase = (machine, [block], options) => {
  const frame = { step: stepCase, running: false, cursor: machine.cursor, all: options.$all !== undefined };
  return testNext({ ...pushFrame(machine, frame), cursor: { ...block.value } }, frame);
};

/**
 * @uses readRest (src/store/store.mjs), stopThrown (src/machine/machine.mjs), popFrame (src/machine/machine.mjs),
 *   startBlock (src/machine/machine.mjs), pushFrame (src/machine/machine.mjs)
 * @usedby FLOW_NATIVES
 */
const catchThrow = (machine, [block], options) => {
  // Without /name, each thrown value stops here. With /name, only a value with one of the names stops here.
  const given = options.$name?.[0];
  const words = given?.type === "block" ? readRest(machine.store, given) : [given];
  const names = given === undefined ? null : words.map((word) => String(word.value).toLowerCase());
  const unwind = (current, frame) =>
    names === null || names.includes(current.thrown.name) ? stopThrown("throw")(current, frame) : popFrame(current);
  return startBlock(pushFrame(machine, { step: popFrame, unwind, cursor: machine.cursor }), block);
};

/**
 * @uses throwValue (src/machine/machine.mjs)
 * @usedby FLOW_NATIVES
 */
const throwNamed = (machine, [value], options) => {
  const thrown = throwValue(machine, "throw", value);
  const name = options.$name === undefined ? undefined : String(options.$name[0].value).toLowerCase();
  return { ...thrown, thrown: { ...thrown.thrown, name } };
};

/**
 * @uses readRest (src/store/store.mjs)
 * @usedby stepCompose
 */
const mergeValue = (machine, frame) => {
  // An unset value adds nothing. A block adds its items, but with /only it is one item.
  const value = machine.value;
  if (frame.nested) return [...frame.out, value];
  if (value.type === "unset") return frame.out;
  return value.type === "block" && !frame.only ? [...frame.out, ...readRest(machine.store, value)] : [...frame.out, value];
};

/**
 * @uses makeSeries (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby stepCompose
 */
const finishCompose = (machine, frame) => {
  const made = makeSeries(machine.store, "block", frame.out);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses giveValue (src/machine/machine.mjs), replaceTop (src/machine/machine.mjs), mergeValue, finishCompose,
 *   popFrame (src/machine/machine.mjs), startBlock (src/machine/machine.mjs), startCompose
 * @usedby startCompose
 */
const stepCompose = (machine, frame) => {
  // A value that the frame waited for goes into the result. Then the next item is examined.
  const next = { ...frame, waiting: false, nested: false, position: frame.position + 1 };
  if (frame.waiting) return giveValue(replaceTop(machine, { ...next, out: mergeValue(machine, frame) }), machine.value);
  const item = frame.items[frame.position];
  if (item === undefined) return finishCompose(popFrame(machine), frame);
  if (item.type === "paren") return startBlock(replaceTop(machine, { ...frame, waiting: true }), item);
  if (item.type !== "block" || !frame.deep) return giveValue(replaceTop(machine, { ...next, out: [...frame.out, item] }), item);
  return startCompose(replaceTop(machine, { ...frame, waiting: true, nested: true }), item, frame);
};

/**
 * @uses stepCompose, readRest (src/store/store.mjs), pushFrame (src/machine/machine.mjs)
 * @usedby stepCompose, composeValue
 */
const startCompose = (machine, block, options) => {
  const frame = { step: stepCompose, items: readRest(machine.store, block), position: 0, out: [] };
  const flags = { waiting: false, nested: false, deep: options.deep, only: options.only };
  return { ...pushFrame(machine, { ...frame, ...flags }), mode: "give" };
};

/**
 * @uses startCompose, giveValue (src/machine/machine.mjs)
 * @usedby FLOW_NATIVES
 */
const composeValue = (machine, [value], options) => {
  const flags = { deep: options.$deep !== undefined, only: options.$only !== undefined };
  return value.type === "block" ? startCompose(machine, value, flags) : giveValue(machine, value);
};

/**
 * The natives that select what the machine evaluates. Each entry has the name of REBOL and the function.
 * @uses scan, switchValue, chooseCase, catchThrow, throwNamed, composeValue
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const FLOW_NATIVES = {
  any: scan(true),
  all: scan(false),
  switch: switchValue,
  case: chooseCase,
  catch: catchThrow,
  throw: throwNamed,
  compose: composeValue,
};
