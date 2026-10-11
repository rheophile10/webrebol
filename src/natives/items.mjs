import { makeDatum } from "../data/datum.mjs";
import { loadSource } from "../data/load.mjs";
import { NONE, UNSET, bindCopy, isList, isSeries, makeContext, makeSeries, readAll, readRest, readValues, readWord, writeWord } from "../store/store.mjs";
import { formValue } from "../store/mold.mjs";
import { failMachine, giveValue, isTrue, makeLogic, makeWord, popFrame, pushFrame, startBlock } from "../machine/machine.mjs";
import { parseSpec } from "../machine/spec.mjs";
import { startReduce } from "./control.mjs";
import { bindLoop, groupValues, startEach } from "./loops.mjs";
import { readOrder } from "./compare.mjs";
import { giveNew, insertContent, makeContent, moveTo, pickItem } from "./series.mjs";
import { readPart, replaceItems } from "./edit.mjs";

/**
 * @usedby makeArray
 */
const countUp = (size) => Array.from({ length: Math.max(size, 0) });

/**
 * @usedby removeEach
 */
const makeText = (values) => values.map((char) => String.fromCharCode(char.value)).join("");

/**
 * @uses makeSeries (src/store/store.mjs), isList (src/store/store.mjs), formValue (src/store/mold.mjs), moveTo,
 *   readAll (src/store/store.mjs), giveValue (src/machine/machine.mjs), insertContent, startReduce
 * @usedby ITEM_NATIVES
 */
const appendReduced = (machine, [series, value], options) => {
  // A block is reduced first. Then its results go to the tail of the series. With /only, they go as one block.
  const finish = (reduced, values) => {
    const made = makeSeries(reduced.store, "block", values);
    const items = options.$only === undefined ? values : [made.value];
    const content = isList(series) ? items : values.map((item) => formValue(made.store, item)).join("");
    const tail = moveTo(series, readAll(made.store, series).length);
    return giveValue(insertContent({ ...reduced, store: made.store }, tail, content), moveTo(series, 0));
  };
  return value.type === "block" ? startReduce(machine, value, finish) : finish(machine, [value]);
};

/**
 * @uses readAll (src/store/store.mjs), readPart, moveTo, readRest (src/store/store.mjs), replaceItems, giveNew,
 *   giveValue (src/machine/machine.mjs), pickItem, NONE (src/store/store.mjs)
 * @usedby ITEM_NATIVES
 */
const takeItems = (machine, [series], options) => {
  // The items leave the series. Without /part, the result is one item, or none for an empty series.
  const size = readAll(machine.store, series).length;
  const count = options.$part === undefined ? 1 : Math.max(readPart(series, options.$part[0]), 0);
  const from = options.$last === undefined ? series : moveTo(series, Math.max(size - count, series.value.index));
  const taken = readRest(machine.store, from).slice(0, count);
  const removed = replaceItems(machine, from, { content: [], size: count });
  if (options.$part !== undefined) return giveNew(removed, series.type, taken);
  return giveValue(removed, pickItem(machine.store, from, 0) ?? NONE);
};

/**
 * @uses readRest (src/store/store.mjs), giveValue (src/machine/machine.mjs), replaceItems
 * @usedby ITEM_NATIVES
 */
const swapItems = (machine, [first, second]) => {
  // The first item of each series goes to the other series.
  const [left, right] = [readRest(machine.store, first)[0], readRest(machine.store, second)[0]];
  if (left === undefined || right === undefined) return giveValue(machine, first);
  const changed = replaceItems(machine, first, { content: [right], size: 1 });
  return giveValue(replaceItems(changed, second, { content: [left], size: 1 }), first);
};

/**
 * @uses readWord (src/store/store.mjs), giveValue (src/machine/machine.mjs), writeWord (src/store/store.mjs),
 *   isSeries (src/store/store.mjs), failMachine (src/machine/machine.mjs), makeWord (src/machine/machine.mjs),
 *   makeDatum (src/data/datum.mjs), readAll (src/store/store.mjs), moveTo
 * @usedby takeFirst, ITEM_NATIVES
 */
const stepWord = (name, move) => (machine, [word]) => {
  // The result is the old value. A number changes by 1. A series moves by one position.
  const value = readWord(machine.store, word);
  if (typeof value.value === "number") {
    return giveValue({ ...machine, store: writeWord(machine.store, word, { ...value, value: value.value + move }) }, value);
  }
  if (!isSeries(value)) {
    return failMachine(machine, "script expect-arg", [makeWord(name), makeWord("word"), makeDatum("datatype", "word")]);
  }
  const index = Math.min(Math.max(value.value.index + move, 0), readAll(machine.store, value).length);
  return giveValue({ ...machine, store: writeWord(machine.store, word, moveTo(value, index)) }, value);
};

/**
 * @uses readWord (src/store/store.mjs), stepWord, giveValue (src/machine/machine.mjs), pickItem,
 *   NONE (src/store/store.mjs)
 * @usedby ITEM_NATIVES
 */
const takeFirst = (machine, [word]) => {
  const series = readWord(machine.store, word);
  const stepped = stepWord("first+", 1)(machine, [word]);
  return giveValue(stepped, pickItem(machine.store, series, 0) ?? NONE);
};

/**
 * @uses readRest (src/store/store.mjs)
 * @usedby removeEach, mapEach
 */
const readWords = (machine, word) => (word.type === "block" ? readRest(machine.store, word) : [word]);

/**
 * @uses bindLoop, readWords, groupValues, isTrue (src/machine/machine.mjs), isList (src/store/store.mjs), makeText,
 *   giveValue (src/machine/machine.mjs), replaceItems, readRest (src/store/store.mjs), startEach
 * @usedby ITEM_NATIVES
 */
const removeEach = (machine, [word, series, body]) => {
  // Keep the groups for which the body does not give a true value.
  const bound = bindLoop(machine, readWords(machine, word), body);
  const values = groupValues(machine.store, series, bound.words.length);
  const finish = (done, results) => {
    const kept = values.filter((group, place) => !isTrue(results[place])).flat();
    const content = isList(series) ? kept : makeText(kept);
    return giveValue(replaceItems(done, series, { content, size: readRest(done.store, series).length }), series);
  };
  return startEach(bound.machine, { words: bound.words, body: bound.body, values }, finish);
};

/**
 * @uses bindLoop, readWords, groupValues, giveNew, NONE (src/store/store.mjs), startEach
 * @usedby ITEM_NATIVES
 */
const mapEach = (machine, [word, series, body]) => {
  const bound = bindLoop(machine, readWords(machine, word), body);
  const values = groupValues(machine.store, series, bound.words.length);
  const finish = (done, results) => giveNew(done, "block", results.map((result) => (result.type === "unset" ? NONE : result)));
  return startEach(bound.machine, { words: bound.words, body: bound.body, values }, finish);
};

/**
 * @uses parseSpec (src/machine/spec.mjs), loadSource (src/data/load.mjs)
 * @usedby collectValues
 */
const KEEP_SPEC = parseSpec(loadSource("value /only").value);

/**
 * @uses moveTo, readAll (src/store/store.mjs), makeContent, giveValue (src/machine/machine.mjs), insertContent
 * @usedby collectValues
 */
const makeKeep = (target) => (machine, [value], options) => {
  // The value goes to the tail of the block of the collect. The result is the value.
  const tail = moveTo(target, readAll(machine.store, target).length);
  const content = makeContent(machine.store, [target, value], options.$only !== undefined);
  return giveValue(insertContent(machine, tail, content), value);
};

/**
 * @uses makeSeries (src/store/store.mjs), makeDatum (src/data/datum.mjs), KEEP_SPEC, makeKeep,
 *   makeContext (src/store/store.mjs), bindCopy (src/store/store.mjs), giveValue (src/machine/machine.mjs),
 *   popFrame (src/machine/machine.mjs), startBlock (src/machine/machine.mjs), pushFrame (src/machine/machine.mjs)
 * @usedby ITEM_NATIVES
 */
const collectValues = (machine, [body]) => {
  // The body gets the word `keep`, which is a function that adds a value to the result.
  const made = makeSeries(machine.store, "block", []);
  const keep = makeDatum("native", { ...KEEP_SPEC, native: makeKeep(made.value) });
  const context = makeContext(made.store, { $keep: keep });
  const bound = bindCopy(context.store, body, { id: context.id, keys: ["$keep"] });
  const frame = { step: (current) => giveValue(popFrame(current), made.value) };
  return startBlock(pushFrame({ ...machine, store: bound.store }, frame), bound.value);
};

/**
 * @uses countUp, makeSeries (src/store/store.mjs)
 * @usedby giveArray
 */
const makeArray = (store, sizes, first) => {
  // A block of sizes gives a block of blocks. Each inner block is a new series.
  const addItem = (made) => {
    const next = sizes.length === 1 ? { store: made.store, value: first } : makeArray(made.store, sizes.slice(1), first);
    return { store: next.store, values: [...made.values, next.value] };
  };
  const made = countUp(sizes[0]).reduce(addItem, { store, values: [] });
  return makeSeries(made.store, "block", made.values);
};

/**
 * @uses readRest (src/store/store.mjs), makeArray, NONE (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby ITEM_NATIVES
 */
const giveArray = (machine, [size], options) => {
  const sizes = size.type === "block" ? readRest(machine.store, size).map((item) => item.value) : [size.value];
  const made = makeArray(machine.store, sizes, options.$initial === undefined ? NONE : options.$initial[0]);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses readValues (src/store/store.mjs), readOrder, giveValue (src/machine/machine.mjs), NONE (src/store/store.mjs),
 *   moveTo
 * @usedby ITEM_NATIVES
 */
const findExtreme = (wanted) => (machine, [series]) => {
  // The result is the series at the position of its smallest or its largest item.
  const data = readValues(machine.store, series).map((item) => readOrder(machine.store, item)?.data);
  const isBetter = (best, item, place) => (best < 0 || item < data[best] === wanted ? place : best);
  const start = data.length > 0 ? 0 : -1;
  const place = data.reduce((best, item, index) => (item === data[best] ? best : isBetter(best, item, index)), start);
  return giveValue(machine, place < 0 ? NONE : moveTo(series, series.value.index + place));
};

/**
 * @uses startReduce, giveNew, formValue (src/store/mold.mjs)
 * @usedby ITEM_NATIVES
 */
const joinAll = (machine, [block]) =>
  startReduce(machine, block, (reduced, values) =>
    giveNew(reduced, "string", values.map((item) => formValue(reduced.store, item)).join("")),
  );

/**
 * More natives for the items of a series. Each entry has the name of REBOL and the function.
 * @uses appendReduced, takeItems, swapItems, takeFirst, stepWord, removeEach, mapEach, collectValues, giveArray,
 *   findExtreme, joinAll, giveValue (src/machine/machine.mjs), makeLogic (src/machine/machine.mjs),
 *   isTrue (src/machine/machine.mjs), makeDatum (src/data/datum.mjs), UNSET (src/store/store.mjs)
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const ITEM_NATIVES = {
  repend: appendReduced,
  take: takeItems,
  swap: swapItems,
  "first+": takeFirst,
  "++": stepWord("++", 1),
  "--": stepWord("--", -1),
  "remove-each": removeEach,
  "map-each": mapEach,
  collect: collectValues,
  array: giveArray,
  "minimum-of": findExtreme(true),
  "maximum-of": findExtreme(false),
  ajoin: joinAll,
  "found?": (machine, [value]) => giveValue(machine, makeLogic(isTrue(value))),
  "true?": (machine, [value]) => giveValue(machine, makeLogic(isTrue(value))),
  "sign?": (machine, [number]) => giveValue(machine, makeDatum("integer", Math.sign(number.value))),
  also: (machine, [first]) => giveValue(machine, first),
  quote: (machine, [value]) => giveValue(machine, value),
  comment: (machine) => giveValue(machine, UNSET),
  recycle: (machine) => giveValue(machine, UNSET),
};
