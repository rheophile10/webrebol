import { makeDatum } from "../data/datum.mjs";
import { NONE, isList, isText, makeSeries, readAll, readRest, writeAll } from "../store/store.mjs";
import { formValue } from "../store/mold.mjs";
import { failMachine, giveValue, makeLogic } from "../machine/machine.mjs";

const SERIES = "series [series!]";
const INSERT = "series [series!] value /only";

/**
 * @uses isList (src/store/store.mjs), isText (src/store/store.mjs), makeDatum (src/data/datum.mjs)
 * @usedby pickItem
 */
const makeItem = (series, raw) => {
  // An item of a text is a char. An item of a binary is an integer.
  if (isList(series)) return raw;
  return isText(series) ? makeDatum("char", raw.charCodeAt(0)) : makeDatum("integer", raw);
};

/**
 * @uses readAll (src/store/store.mjs), makeItem
 * @usedby takeItem, pickIndex
 */
const pickItem = (store, series, offset) => {
  // Give null if the position is not in the series.
  const all = readAll(store, series);
  const place = series.value.index + offset;
  return place < 0 || place >= all.length ? null : makeItem(series, all[place]);
};

/**
 * @uses pickItem, failMachine (src/machine/machine.mjs), giveValue (src/machine/machine.mjs)
 * @usedby SERIES_NATIVES
 */
const takeItem = (offset) => (machine, [series]) => {
  const item = pickItem(machine.store, series, offset);
  return item === null ? failMachine(machine, "script past-end") : giveValue(machine, item);
};

/**
 * @uses pickItem, giveValue (src/machine/machine.mjs), NONE (src/store/store.mjs)
 * @usedby SERIES_NATIVES
 */
const pickIndex = (machine, [series, index]) => {
  // A positive index counts from the position. A negative index counts back from it.
  const offset = index.value > 0 ? index.value - 1 : index.value;
  const item = index.value === 0 ? null : pickItem(machine.store, series, offset);
  return giveValue(machine, item ?? NONE);
};

/**
 * @usedby move, appendValue, insertValue
 */
const moveTo = (series, index) => ({ ...series, value: { ...series.value, index } });

/**
 * @uses readAll (src/store/store.mjs), giveValue (src/machine/machine.mjs), moveTo
 * @usedby SERIES_NATIVES
 */
const move = (find) => (machine, [series]) => {
  // The position stays between the head and the tail.
  const size = readAll(machine.store, series).length;
  const index = Math.min(Math.max(find(series.value.index, size), 0), size);
  return giveValue(machine, moveTo(series, index));
};

/**
 * @uses giveValue (src/machine/machine.mjs), readAll (src/store/store.mjs)
 * @usedby SERIES_NATIVES
 */
const measure = (find) => (machine, [series]) =>
  giveValue(machine, find(series.value.index, readAll(machine.store, series).length));

/**
 * @uses isList (src/store/store.mjs), readRest (src/store/store.mjs), formValue (src/store/mold.mjs)
 * @usedby appendValue, insertValue
 */
const makeContent = (store, [series, value], only) => {
  // A block gives its items to a list, but with /only the block is one item.
  if (isList(series)) return isList(value) && !only ? readRest(store, value) : [value];
  const parts = isList(value) ? readRest(store, value) : [value];
  return parts.map((part) => formValue(store, part)).join("");
};

/**
 * @uses readAll (src/store/store.mjs), writeAll (src/store/store.mjs)
 * @usedby appendValue, insertValue
 */
const insertContent = (machine, series, content) => {
  // Put the content at the position of the series.
  const all = readAll(machine.store, series);
  const place = series.value.index;
  const joined = all.slice(0, place).concat(content, all.slice(place));
  return { ...machine, store: writeAll(machine.store, series, joined) };
};

/**
 * @uses makeContent, moveTo, readAll (src/store/store.mjs), giveValue (src/machine/machine.mjs), insertContent
 * @usedby SERIES_NATIVES
 */
const appendValue = (machine, args, names) => {
  // The result is the head of the series.
  const content = makeContent(machine.store, args, names.includes("$only"));
  const tail = moveTo(args[0], readAll(machine.store, args[0]).length);
  return giveValue(insertContent(machine, tail, content), moveTo(args[0], 0));
};

/**
 * @uses makeContent, moveTo, giveValue (src/machine/machine.mjs), insertContent
 * @usedby SERIES_NATIVES
 */
const insertValue = (machine, args, names) => {
  // The result is the position after the new items.
  const content = makeContent(machine.store, args, names.includes("$only"));
  const after = moveTo(args[0], args[0].value.index + content.length);
  return giveValue(insertContent(machine, args[0], content), after);
};

/**
 * @uses makeSeries (src/store/store.mjs), readRest (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby SERIES_NATIVES
 */
const copySeries = (machine, [series]) => {
  const made = makeSeries(machine.store, series.type, readRest(machine.store, series));
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * The natives for series. Each entry has the specification and the function.
 * @uses SERIES, takeItem, pickIndex, move, measure, makeLogic (src/machine/machine.mjs),
 *   makeDatum (src/data/datum.mjs), INSERT, appendValue, insertValue, copySeries
 * @usedby NATIVES
 */
export const SERIES_NATIVES = {
  first: [SERIES, takeItem(0)],
  second: [SERIES, takeItem(1)],
  pick: ["series [series!] index [integer!]", pickIndex],
  next: [SERIES, move((index) => index + 1)],
  back: [SERIES, move((index) => index - 1)],
  head: [SERIES, move(() => 0)],
  tail: [SERIES, move((index, size) => size)],
  "tail?": [SERIES, measure((index, size) => makeLogic(index >= size))],
  "empty?": [SERIES, measure((index, size) => makeLogic(index >= size))],
  "length?": [SERIES, measure((index, size) => makeDatum("integer", Math.max(size - index, 0)))],
  "index?": [SERIES, measure((index) => makeDatum("integer", index + 1))],
  append: [INSERT, appendValue],
  insert: [INSERT, insertValue],
  copy: ["value [series!]", copySeries],
};
