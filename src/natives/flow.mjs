import { NONE, makeSeries, readRest } from "../store/store.mjs";
import { advance, atEnd, giveValue, isTrue, makeLogic, popFrame, pushFrame, readItem, replaceTop, startBlock, stopThrown, throwValue } from "../machine/machine.mjs";
import { areEqual } from "./compare.mjs";

/**
 * @uses giveValue (src/machine/machine.mjs), popFrame (src/machine/machine.mjs)
 * @usedby stepScan, testNext, stepCase
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
 * @uses atEnd (src/machine/machine.mjs), finishScan, NONE (src/store/store.mjs), readItem (src/machine/machine.mjs),
 *   isTrue (src/machine/machine.mjs), testNext, advance (src/machine/machine.mjs),
 *   startBlock (src/machine/machine.mjs), replaceTop (src/machine/machine.mjs)
 * @usedby chooseCase
 */
const stepCase = (machine, frame) => {
  // The value is the result of a block, or it is a condition with its block at the cursor.
  if (frame.running || atEnd(machine)) return finishScan(machine, frame, frame.running ? machine.value : NONE);
  const block = readItem(machine);
  if (!isTrue(machine.value)) return testNext(advance(machine), frame);
  return startBlock(replaceTop(advance(machine), { ...frame, running: true }), block);
};

/**
 * @uses stepCase, testNext, pushFrame (src/machine/machine.mjs)
 * @usedby FLOW_NATIVES
 */
const chooseCase = (machine, [block]) => {
  const frame = { step: stepCase, running: false, cursor: machine.cursor };
  return testNext({ ...pushFrame(machine, frame), cursor: { ...block.value } }, frame);
};

/**
 * @uses startBlock (src/machine/machine.mjs), pushFrame (src/machine/machine.mjs),
 *   popFrame (src/machine/machine.mjs), stopThrown (src/machine/machine.mjs)
 * @usedby FLOW_NATIVES
 */
const catchThrow = (machine, [block]) =>
  startBlock(pushFrame(machine, { step: popFrame, unwind: stopThrown("throw"), cursor: machine.cursor }), block);

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
const composeValue = (machine, [value], names) => {
  const options = { deep: names.includes("$deep"), only: names.includes("$only") };
  return value.type === "block" ? startCompose(machine, value, options) : giveValue(machine, value);
};

/**
 * The natives that select what the machine evaluates. Each entry has the specification and the function.
 * @uses scan, switchValue, chooseCase, catchThrow, throwValue (src/machine/machine.mjs), composeValue
 * @usedby NATIVES
 */
export const FLOW_NATIVES = {
  any: ["block [block!]", scan(true)],
  all: ["block [block!]", scan(false)],
  switch: ["value cases [block!] /default case", switchValue],
  case: ["block [block!]", chooseCase],
  catch: ["block [block!]", catchThrow],
  throw: ["value [any-type!]", (machine, [value]) => throwValue(machine, "throw", value)],
  compose: ["value /deep /only", composeValue],
};
