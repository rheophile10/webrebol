import { makeDatum } from "../data/datum.mjs";
import { NONE, UNSET, bindCopy, makeContext, makeKey, readAll, readRest, readValues, readWord, writeWord } from "../store/store.mjs";
import { giveValue, isTrue, popFrame, pushFrame, replaceTop, startBlock, stopThrown, throwValue } from "../machine/machine.mjs";

const BODY = "body [block!]";
/**
 * @uses stopThrown (src/machine/machine.mjs)
 * @usedby startList, loopWhile, loopUntil, loopForever
 */
const stopBreak = stopThrown("break");

/**
 * @uses writeWord (src/store/store.mjs), NONE (src/store/store.mjs)
 * @usedby stepList
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
 * @usedby loopCount, repeatCount, forEach, forRange, forAll
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
const bindLoop = (machine, words, body) => {
  // The words of a loop are in a new context. The body is a copy that uses this context.
  const made = makeContext(machine.store, {});
  const bound = bindCopy(made.store, body, { id: made.id, keys: words.map((word) => makeKey(word.value)) });
  const local = words.map((word) => ({ ...word, type: "word", bind: made.id }));
  return { machine: { ...machine, store: bound.store }, words: local, body: bound.value };
};

/**
 * @usedby loopCount, repeatCount, forEach, forRange, forAll
 */
const countUp = (size) => Array.from({ length: Math.max(size, 0) });

/**
 * @uses startList, countUp, UNSET (src/store/store.mjs)
 * @usedby LOOP_NATIVES
 */
const loopCount = (machine, [count, body]) => startList(machine, { words: [], body, values: countUp(count.value) }, UNSET);

/**
 * @uses bindLoop, countUp, makeDatum (src/data/datum.mjs), startList, UNSET (src/store/store.mjs)
 * @usedby LOOP_NATIVES
 */
const repeatCount = (machine, [word, count, body]) => {
  const bound = bindLoop(machine, [word], body);
  const values = countUp(count.value).map((item, place) => [makeDatum("integer", place + 1)]);
  return startList(bound.machine, { words: bound.words, body: bound.body, values }, UNSET);
};

/**
 * @uses readRest (src/store/store.mjs), readValues (src/store/store.mjs), bindLoop, countUp, startList,
 *   NONE (src/store/store.mjs)
 * @usedby LOOP_NATIVES
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

/**
 * @uses bindLoop, countUp, makeDatum (src/data/datum.mjs), startList, NONE (src/store/store.mjs)
 * @usedby LOOP_NATIVES
 */
const forRange = (machine, [word, start, end, bump, body]) => {
  // TODO: REBOL does not stop with a bump of zero. Here, a bump of zero gives no turn of the loop.
  const size = bump.value === 0 ? 0 : Math.floor((end.value - start.value) / bump.value) + 1;
  const bound = bindLoop(machine, [word], body);
  const values = countUp(size).map((item, place) => [makeDatum("integer", start.value + place * bump.value)]);
  return startList(bound.machine, { words: bound.words, body: bound.body, values }, NONE);
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
 * The natives for loops. Each entry has the specification and the function.
 * @uses BODY, loopCount, repeatCount, forEach, forRange, forAll, loopWhile, loopUntil, loopForever,
 *   UNSET (src/store/store.mjs), throwValue (src/machine/machine.mjs)
 * @usedby NATIVES
 */
export const LOOP_NATIVES = {
  loop: [`count [integer!] ${BODY}`, loopCount],
  repeat: [`'word [word!] value [integer!] ${BODY}`, repeatCount],
  foreach: [`'word [word! block!] data [series!] ${BODY}`, forEach],
  for: [`'word [word!] start [integer!] end [integer!] bump [integer!] ${BODY}`, forRange],
  forall: [`'word [word!] ${BODY}`, forAll],
  while: ["cond-block [block!] body-block [block!]", loopWhile],
  until: ["block [block!]", loopUntil],
  forever: [BODY, loopForever],
  break: ["/return value [any-type!]", (machine, [value = UNSET]) => throwValue(machine, "break", value)],
};
