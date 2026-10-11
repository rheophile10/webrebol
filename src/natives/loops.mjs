/** @import { Datum, Store, Machine } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { NONE, UNSET, bindCopy, isSeries, makeContext, makeKey, readAll, readRest, readValues, readWord, writeWord } from "../store/store.mjs";
import { giveValue, isTrue, popFrame, pushFrame, replaceTop, startBlock, stopThrown, throwValue } from "../machine/machine.mjs";

/**
 * @uses stopThrown (src/machine/machine.mjs)
 * @usedby startList, startEach, loopWhile, loopUntil, loopForever
 */
const stopBreak = stopThrown("break");

/**
 * @uses writeWord (src/store/store.mjs), NONE (src/store/store.mjs)
 * @usedby stepList, stepEach
 */
const assignWords = (store, frame) =>
  frame.words.reduce(
    (current, word, place) => writeWord(current, word, frame.values[frame.position][place] ?? NONE),
    store,
  );

/**
 * @uses writeWord (src/store/store.mjs)
 * @usedby stepList
 */
const finishList = (machine, frame) =>
  frame.reset === undefined ? machine : { ...machine, store: writeWord(machine.store, frame.words[0], frame.reset) };

/**
 * @uses finishList, popFrame (src/machine/machine.mjs), assignWords, startBlock (src/machine/machine.mjs),
 *   replaceTop (src/machine/machine.mjs)
 * @usedby startList
 */
const stepList = (machine, frame) => {
  // After the last group of values, the result of the loop is the result of the last body.
  if (frame.position >= frame.values.length) return finishList(popFrame(machine), frame);
  const store = assignWords(machine.store, frame);
  return startBlock({ ...replaceTop(machine, { ...frame, position: frame.position + 1 }), store }, frame.body);
};

/**
 * @uses stepList, stopBreak, pushFrame (src/machine/machine.mjs)
 * @usedby loopCount, repeatCount, forEach, forRange, forSkip, forAll
 */
const startList = (machine, loop, first) => {
  // The loop evaluates its body one time for each group of values of the list.
  const frame = { ...loop, step: stepList, unwind: stopBreak, position: 0, cursor: machine.cursor };
  return stepList({ ...pushFrame(machine, frame), value: first, mode: "give" }, frame);
};

/**
 * @uses makeContext (src/store/store.mjs), bindCopy (src/store/store.mjs), makeKey (src/store/store.mjs)
 * @usedby repeatCount, forEach, forRange
 */
/**
 * Makes a context for the words of a loop, and a copy of the body that uses this context.
 * @param {Machine} machine
 * @param {Datum[]} words
 * @param {Datum} body
 * @returns {{ machine: Machine, words: Datum[], body: Datum }}
 * @standard local - A word of the loop does not change the word with the same name outside the loop.
 * @uses makeContext (src/store/store.mjs), bindCopy (src/store/store.mjs), makeKey (src/store/store.mjs)
 * @usedby removeEach, mapEach, repeatCount, forEach, forRange
 */
export const bindLoop = (machine, words, body) => {
  // The words of a loop are in a new context. The body is a copy that uses this context.
  const made = makeContext(machine.store, {});
  const bound = bindCopy(made.store, body, { id: made.id, keys: words.map((word) => makeKey(word.value)) });
  const local = words.map((word) => ({ ...word, type: "word", bind: made.id }));
  return { machine: { ...machine, store: bound.store }, words: local, body: bound.value };
};

/**
 * @uses popFrame (src/machine/machine.mjs), assignWords, startBlock (src/machine/machine.mjs),
 *   replaceTop (src/machine/machine.mjs)
 * @usedby startEach
 */
const stepEach = (machine, frame) => {
  // Keep the result of the body for each group of values. The owner gets the results at the end.
  const results = frame.position === 0 ? [] : [...frame.results, machine.value];
  if (frame.position >= frame.values.length) return frame.finish(popFrame(machine), results);
  const store = assignWords(machine.store, frame);
  return startBlock({ ...replaceTop(machine, { ...frame, results, position: frame.position + 1 }), store }, frame.body);
};

/**
 * Starts a loop that evaluates a body for each group of values and keeps each result.
 * @param {Machine} machine
 * @param {{ words: Datum[], body: Datum, values: Datum[][] }} loop
 * @param {Function} finish - The function that gets the machine and the results, and gives the next machine.
 * @returns {Machine}
 * @standard sequence - The results are in the sequence of the groups.
 * @uses stepEach, stopBreak, pushFrame (src/machine/machine.mjs)
 * @usedby removeEach, mapEach
 */
export const startEach = (machine, loop, finish) => {
  const frame = { ...loop, step: stepEach, unwind: stopBreak, position: 0, results: [], finish, cursor: machine.cursor };
  return stepEach(pushFrame(machine, frame), frame);
};

/**
 * Divides the items of a series into groups, one item for each word of a loop.
 * @param {Store} store
 * @param {Datum} series
 * @param {number} size - The number of words.
 * @returns {Datum[][]}
 * @uses readValues (src/store/store.mjs), countUp
 * @usedby removeEach, mapEach
 */
export const groupValues = (store, series, size) => {
  const items = readValues(store, series);
  return countUp(Math.ceil(items.length / size)).map((item, place) => items.slice(place * size, (place + 1) * size));
};

/**
 * @usedby groupValues, loopCount, repeatCount, forEach, listForValues, forSkip, forAll
 */
const countUp = (size) => Array.from({ length: Math.max(size, 0) });

/**
 * @uses startList, countUp, UNSET (src/store/store.mjs)
 * @usedby LOOP_NATIVES
 */
const loopCount = (machine, [count, body]) => startList(machine, { words: [], body, values: countUp(count.value) }, UNSET);

/**
 * @uses forEach, bindLoop, countUp, makeDatum (src/data/datum.mjs), startList, UNSET (src/store/store.mjs)
 * @usedby LOOP_NATIVES
 */
const repeatCount = (machine, [word, count, body]) => {
  // With a series, the word gets each item of the series.
  if (typeof count.value !== "number") return forEach(machine, [word, count, body]);
  const bound = bindLoop(machine, [word], body);
  const values = countUp(count.value).map((item, place) => [makeDatum("integer", place + 1)]);
  return startList(bound.machine, { words: bound.words, body: bound.body, values }, UNSET);
};

/**
 * @uses readRest (src/store/store.mjs), readValues (src/store/store.mjs), bindLoop, countUp, startList,
 *   NONE (src/store/store.mjs)
 * @usedby repeatCount, LOOP_NATIVES
 */
const forEach = (machine, [word, series, body]) => {
  // With a block of words, each turn of the loop takes one item for each word.
  const names = word.type === "block" ? readRest(machine.store, word) : [word];
  const items = readValues(machine.store, series);
  const bound = bindLoop(machine, names, body);
  const takeGroup = (item, place) => items.slice(place * names.length, (place + 1) * names.length);
  const values = countUp(Math.ceil(items.length / names.length)).map(takeGroup);
  return startList(bound.machine, { words: bound.words, body: bound.body, values }, NONE);
};

const ZERO_BUMP_TURNS = 100000;

/**
 * @uses stopBreak, NONE (src/store/store.mjs)
 * @usedby forRange
 */
/**
 * @uses isSeries (src/store/store.mjs), ZERO_BUMP_TURNS, makeDatum (src/data/datum.mjs), countUp
 * @usedby forRange
 */
const listForValues = (start, end, bump) => {
  // Two series give the positions from the first to the second. Two numbers give the numbers.
  const [first, last] = isSeries(start) ? [start.value.index, end.value.index] : [start.value, end.value];
  const turns = Math.floor((last - first) / bump.value) + 1;
  // TODO: REBOL does not stop with a bump of zero. Here, the loop stops after a large number of turns.
  const endless = first <= last ? ZERO_BUMP_TURNS : 0;
  const size = bump.value === 0 ? endless : turns;
  const makeValue = (place) => (isSeries(start) ? { ...start, value: { ...start.value, index: first + place * bump.value } } : makeDatum("integer", first + place * bump.value));
  return { values: countUp(size).map((item, place) => [makeValue(place)]) };
};

/**
 * @uses bindLoop, listForValues, startList, NONE (src/store/store.mjs)
 * @usedby LOOP_NATIVES
 */
const forRange = (machine, [word, start, end, bump, body]) => {
  const bound = bindLoop(machine, [word], body);
  const listed = listForValues(start, end, bump);
  return startList(bound.machine, { words: bound.words, body: bound.body, values: listed.values }, NONE);
};

/**
 * @uses readWord (src/store/store.mjs), readAll (src/store/store.mjs), startList, countUp,
 *   UNSET (src/store/store.mjs)
 * @usedby LOOP_NATIVES
 */
const forSkip = (machine, [word, step, body]) => {
  // The word gets each position that is a number of items after the position before it.
  const series = readWord(machine.store, word);
  const size = Math.ceil((readAll(machine.store, series).length - series.value.index) / step.value);
  const moveTo = (item, place) => [{ ...series, value: { ...series.value, index: series.value.index + place * step.value } }];
  return startList(machine, { words: [word], body, values: countUp(size).map(moveTo), reset: series }, UNSET);
};

/**
 * @uses readWord (src/store/store.mjs), readAll (src/store/store.mjs), startList, countUp,
 *   UNSET (src/store/store.mjs)
 * @usedby LOOP_NATIVES
 */
const forAll = (machine, [word, body]) => {
  // The word gets each position of its series. After the loop, it gets its first position again.
  const series = readWord(machine.store, word);
  const size = readAll(machine.store, series).length - series.value.index;
  const moveTo = (item, place) => [{ ...series, value: { ...series.value, index: series.value.index + place } }];
  return startList(machine, { words: [word], body, values: countUp(size).map(moveTo), reset: series }, UNSET);
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
 * @uses stepWhile, stopBreak, NONE (src/store/store.mjs), startBlock (src/machine/machine.mjs),
 *   pushFrame (src/machine/machine.mjs)
 * @usedby LOOP_NATIVES
 */
const loopWhile = (machine, [condition, body]) => {
  const frame = { step: stepWhile, unwind: stopBreak, condition, body, testing: true, last: NONE };
  return startBlock(pushFrame(machine, { ...frame, cursor: machine.cursor }), condition);
};

/**
 * @uses isTrue (src/machine/machine.mjs), popFrame (src/machine/machine.mjs), startBlock (src/machine/machine.mjs)
 * @usedby loopUntil
 */
const stepUntil = (machine, frame) => (isTrue(machine.value) ? popFrame(machine) : startBlock(machine, frame.body));

/**
 * @uses startBlock (src/machine/machine.mjs), pushFrame (src/machine/machine.mjs), stepUntil, stopBreak
 * @usedby LOOP_NATIVES
 */
const loopUntil = (machine, [body]) =>
  startBlock(pushFrame(machine, { step: stepUntil, unwind: stopBreak, body, cursor: machine.cursor }), body);

/**
 * @uses startBlock (src/machine/machine.mjs)
 * @usedby loopForever
 */
const stepForever = (machine, frame) => startBlock(machine, frame.body);

/**
 * @uses startBlock (src/machine/machine.mjs), pushFrame (src/machine/machine.mjs), stepForever, stopBreak
 * @usedby LOOP_NATIVES
 */
const loopForever = (machine, [body]) =>
  startBlock(pushFrame(machine, { step: stepForever, unwind: stopBreak, body, cursor: machine.cursor }), body);

/**
 * The natives for loops. Each entry has the name of REBOL and the function.
 * @uses loopCount, repeatCount, forEach, forRange, forAll, forSkip, loopWhile, loopUntil, loopForever,
 *   UNSET (src/store/store.mjs), throwValue (src/machine/machine.mjs)
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const LOOP_NATIVES = {
  loop: loopCount,
  repeat: repeatCount,
  foreach: forEach,
  for: forRange,
  forall: forAll,
  forskip: forSkip,
  while: loopWhile,
  until: loopUntil,
  forever: loopForever,
  break: (machine, [value = UNSET]) => throwValue(machine, "break", value),
};
