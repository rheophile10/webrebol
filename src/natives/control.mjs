/** @import { Datum, Machine } from "../types/states.mjs" */
import { loadSource } from "../data/load.mjs";
import { makeDatum } from "../data/datum.mjs";
import { NONE, UNSET, allocate, bindCopy, isList, makeKey, makeSeries, readRest, writeContext, writeWord } from "../store/store.mjs";
import { atEnd, failMachine, giveValue, isTrue, popFrame, pushFrame, replaceTop, startBlock, throwValue } from "../machine/machine.mjs";
import { parseSpec } from "../machine/spec.mjs";

const BODY = "body [block!]";

/**
 * @uses popFrame (src/machine/machine.mjs), giveValue (src/machine/machine.mjs)
 * @usedby startList, loopWhile, loopUntil
 */
const unwindLoop = (machine, frame) => {
  // A break stops at its loop. Other thrown values continue up the stack.
  const popped = popFrame(machine);
  if (machine.thrown.kind !== "break") return popped;
  return { ...giveValue(popped, machine.thrown.value), cursor: frame.cursor, thrown: null };
};

/**
 * @uses popFrame (src/machine/machine.mjs), writeWord (src/store/store.mjs), startBlock (src/machine/machine.mjs),
 *   replaceTop (src/machine/machine.mjs)
 * @usedby startList
 */
const stepList = (machine, frame) => {
  // After the last value, the result of the loop is the result of the last body.
  if (frame.position >= frame.values.length) return popFrame(machine);
  const value = frame.values[frame.position];
  const store = frame.word === null ? machine.store : writeWord(machine.store, frame.word, value);
  return startBlock({ ...replaceTop(machine, { ...frame, position: frame.position + 1 }), store }, frame.body);
};

/**
 * @uses stepList, unwindLoop, pushFrame (src/machine/machine.mjs)
 * @usedby loopCount, repeatCount, forEach
 */
const startList = (machine, loop, first) => {
  // The loop evaluates its body one time for each value of the list.
  const frame = { ...loop, step: stepList, unwind: unwindLoop, position: 0, cursor: machine.cursor };
  return stepList({ ...pushFrame(machine, frame), value: first, mode: "give" }, frame);
};

/**
 * @uses makeKey (src/store/store.mjs), writeContext (src/store/store.mjs), bindCopy (src/store/store.mjs)
 * @usedby repeatCount, forEach
 */
const bindLoop = (machine, word, body) => {
  // The word of a loop is in a new context. The body is a copy that uses this context.
  const context = { id: machine.store.next, keys: [makeKey(word.value)] };
  const store = { ...writeContext(machine.store, context.id, {}), next: context.id + 1 };
  const bound = bindCopy(store, body, context);
  return { machine: { ...machine, store: bound.store }, word: { ...word, bind: context.id }, body: bound.value };
};

/**
 * @uses startList, UNSET (src/store/store.mjs)
 * @usedby CONTROL_NATIVES
 */
const loopCount = (machine, [count, body]) =>
  startList(machine, { word: null, body, values: Array.from({ length: Math.max(count.value, 0) }) }, UNSET);

/**
 * @uses bindLoop, makeDatum (src/data/datum.mjs), startList, UNSET (src/store/store.mjs)
 * @usedby CONTROL_NATIVES
 */
const repeatCount = (machine, [word, count, body]) => {
  const bound = bindLoop(machine, word, body);
  const values = Array.from({ length: Math.max(count.value, 0) }).map((item, place) => makeDatum("integer", place + 1));
  return startList(bound.machine, { word: bound.word, body: bound.body, values }, UNSET);
};

/**
 * @uses isList (src/store/store.mjs), failMachine (src/machine/machine.mjs), bindLoop, startList,
 *   readRest (src/store/store.mjs), NONE (src/store/store.mjs)
 * @usedby CONTROL_NATIVES
 */
const forEach = (machine, [word, series, body]) => {
  // Only a list is supported at this time.
  if (!isList(series)) return failMachine(machine, "script expect-arg");
  const bound = bindLoop(machine, word, body);
  return startList(bound.machine, { word: bound.word, body: bound.body, values: readRest(machine.store, series) }, NONE);
};

/**
 * @uses startBlock (src/machine/machine.mjs), replaceTop (src/machine/machine.mjs), isTrue (src/machine/machine.mjs),
 *   giveValue (src/machine/machine.mjs), popFrame (src/machine/machine.mjs)
 * @usedby loopWhile
 */
const stepWhile = (machine, frame) => {
  // After the body, evaluate the condition again. Keep the result of the body.
  if (!frame.testing) {
    return startBlock(replaceTop(machine, { ...frame, testing: true, last: machine.value }), frame.condition);
  }
  if (!isTrue(machine.value)) return giveValue(popFrame(machine), frame.last);
  return startBlock(replaceTop(machine, { ...frame, testing: false }), frame.body);
};

/**
 * @uses stepWhile, unwindLoop, NONE (src/store/store.mjs), startBlock (src/machine/machine.mjs),
 *   pushFrame (src/machine/machine.mjs)
 * @usedby CONTROL_NATIVES
 */
const loopWhile = (machine, [condition, body]) => {
  const frame = { step: stepWhile, unwind: unwindLoop, condition, body, testing: true, last: NONE };
  return startBlock(pushFrame(machine, { ...frame, cursor: machine.cursor }), condition);
};

/**
 * @uses isTrue (src/machine/machine.mjs), popFrame (src/machine/machine.mjs), startBlock (src/machine/machine.mjs)
 * @usedby loopUntil
 */
const stepUntil = (machine, frame) => (isTrue(machine.value) ? popFrame(machine) : startBlock(machine, frame.body));

/**
 * @uses startBlock (src/machine/machine.mjs), pushFrame (src/machine/machine.mjs), stepUntil, unwindLoop
 * @usedby CONTROL_NATIVES
 */
const loopUntil = (machine, [body]) =>
  startBlock(pushFrame(machine, { step: stepUntil, unwind: unwindLoop, body, cursor: machine.cursor }), body);

/**
 * @uses popFrame (src/machine/machine.mjs), giveValue (src/machine/machine.mjs)
 * @usedby tryBlock
 */
const unwindTry = (machine, frame) => {
  // An error stops at its try, and becomes the result.
  const popped = popFrame(machine);
  if (machine.thrown.kind !== "error") return popped;
  return { ...giveValue(popped, machine.thrown.value), cursor: frame.cursor, thrown: null };
};

/**
 * @uses startBlock (src/machine/machine.mjs), pushFrame (src/machine/machine.mjs),
 *   popFrame (src/machine/machine.mjs), unwindTry
 * @usedby CONTROL_NATIVES
 */
const tryBlock = (machine, [block]) =>
  startBlock(pushFrame(machine, { step: popFrame, unwind: unwindTry, cursor: machine.cursor }), block);

/**
 * @uses isList (src/store/store.mjs), readRest (src/store/store.mjs)
 * @usedby makeFunction
 */
const readSpecItem = (store) => (item) => (isList(item) ? { type: "block", value: readRest(store, item).map((name) => String(name.value)) } : item);

/**
 * @uses parseSpec (src/machine/spec.mjs), readRest (src/store/store.mjs), readSpecItem,
 *   writeContext (src/store/store.mjs), bindCopy (src/store/store.mjs), makeDatum (src/data/datum.mjs),
 *   giveValue (src/machine/machine.mjs)
 * @usedby makeDoes, CONTROL_NATIVES
 */
const makeFunction = (machine, [spec, body]) => {
  // The function gets a context for its words. The body is a copy that uses this context.
  const parsed = parseSpec(readRest(machine.store, spec).map(readSpecItem(machine.store)));
  const context = { id: machine.store.next, keys: parsed.keys };
  const store = { ...writeContext(machine.store, context.id, {}), next: context.id + 1 };
  const bound = bindCopy(store, body, context);
  const callee = makeDatum("function", { ...parsed, context: context.id, body: bound.value });
  return giveValue({ ...machine, store: bound.store }, callee);
};

/**
 * @uses makeSeries (src/store/store.mjs), makeFunction
 * @usedby CONTROL_NATIVES
 */
const makeDoes = (machine, [body]) => {
  const empty = makeSeries(machine.store, "block", []);
  return makeFunction({ ...machine, store: empty.store }, [empty.value, body]);
};

/**
 * @uses loadSource (src/data/load.mjs), readRest (src/store/store.mjs), failMachine (src/machine/machine.mjs),
 *   allocate (src/store/store.mjs), startBlock (src/machine/machine.mjs)
 * @usedby doValue
 */
const doText = (machine, text) => {
  // Load the text. A text that is not valid REBOL gives the error of the loader.
  const loaded = loadSource(readRest(machine.store, text));
  if (loaded.type === "error") return failMachine(machine, loaded.value);
  const made = allocate(machine.store, loaded);
  return startBlock({ ...machine, store: made.store }, made.value);
};

/**
 * @uses startBlock (src/machine/machine.mjs), doText, giveValue (src/machine/machine.mjs)
 * @usedby CONTROL_NATIVES
 */
const doValue = (machine, [value]) => {
  if (value.type === "block" || value.type === "paren") return startBlock(machine, value);
  return value.type === "string" ? doText(machine, value) : giveValue(machine, value);
};

/**
 * @uses atEnd (src/machine/machine.mjs), popFrame (src/machine/machine.mjs)
 * @usedby stepReduce, startReduce
 */
const continueReduce = (machine) => {
  // At the end of the block, the owner gets the values.
  const frame = machine.frames.top;
  if (!atEnd(machine)) return { ...machine, mode: "next" };
  return frame.finish({ ...popFrame(machine), cursor: frame.cursor }, frame.values);
};

/**
 * @uses continueReduce, replaceTop (src/machine/machine.mjs)
 * @usedby startReduce
 */
const stepReduce = (machine, frame) =>
  continueReduce(replaceTop(machine, { ...frame, values: [...frame.values, machine.value] }));

/**
 * Starts the evaluation of each expression of a block. A function gets the list of the results.
 * @param {Machine} machine
 * @param {Datum} block
 * @param {Function} finish - The function that gets the machine and the results, and gives the next machine.
 * @returns {Machine}
 * @standard sequence - The results are in the sequence of the expressions.
 * @uses stepReduce, continueReduce, pushFrame (src/machine/machine.mjs)
 * @usedby reduceValue, printValue
 */
export const startReduce = (machine, block, finish) => {
  const frame = { step: stepReduce, values: [], cursor: machine.cursor, finish };
  return continueReduce({ ...pushFrame(machine, frame), cursor: { ...block.value } });
};

/**
 * @uses makeSeries (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby reduceValue
 */
const giveBlock = (machine, values) => {
  const made = makeSeries(machine.store, "block", values);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses startReduce, giveBlock, giveValue (src/machine/machine.mjs)
 * @usedby CONTROL_NATIVES
 */
const reduceValue = (machine, [value]) =>
  value.type === "block" ? startReduce(machine, value, giveBlock) : giveValue(machine, value);

/**
 * @uses isTrue (src/machine/machine.mjs), startBlock (src/machine/machine.mjs), giveValue (src/machine/machine.mjs),
 *   NONE (src/store/store.mjs)
 * @usedby CONTROL_NATIVES
 */
const chooseBlock = (wanted) => (machine, [condition, block]) =>
  isTrue(condition) === wanted ? startBlock(machine, block) : giveValue(machine, NONE);

/**
 * The natives for control of the evaluation. Each entry has the specification and the function.
 * @uses chooseBlock, startBlock (src/machine/machine.mjs), isTrue (src/machine/machine.mjs), BODY, loopCount,
 *   repeatCount, forEach, loopWhile, loopUntil, UNSET (src/store/store.mjs), throwValue (src/machine/machine.mjs),
 *   makeFunction, makeDoes, doValue, reduceValue, tryBlock
 * @usedby NATIVES
 */
export const CONTROL_NATIVES = {
  "if": ["condition then-block [block!]", chooseBlock(true)],
  unless: ["condition block [block!]", chooseBlock(false)],
  either: [
    "condition true-block [block!] false-block [block!]",
    (machine, [condition, yes, other]) => startBlock(machine, isTrue(condition) ? yes : other),
  ],
  loop: [`count [integer!] ${BODY}`, loopCount],
  repeat: [`'word [word!] value [integer!] ${BODY}`, repeatCount],
  foreach: [`'word [word!] data [series!] ${BODY}`, forEach],
  while: ["cond-block [block!] body-block [block!]", loopWhile],
  until: ["block [block!]", loopUntil],
  break: ["/return value [any-type!]", (machine, [value = UNSET]) => throwValue(machine, "break", value)],
  return: ["value [any-type!]", (machine, [value]) => throwValue(machine, "return", value)],
  func: [`spec [block!] ${BODY}`, makeFunction],
  does: [BODY, makeDoes],
  "do": ["value", doValue],
  reduce: ["value", reduceValue],
  try: ["block [block!]", tryBlock],
};
