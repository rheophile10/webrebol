/** @import { Datum, Store, Machine } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { isList, isSeries, isText, makeSeries, NONE, readAll, readContext, readRest, writeAll } from "../store/store.mjs";
import { formValue } from "../store/mold.mjs";
import { readField } from "../store/parts.mjs";
import { failMachine, giveValue, makeLogic, makeWord } from "../machine/machine.mjs";


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
 * @usedby takeItem, pickIndex, selectValue
 */
/**
 * Gets the item at an offset from the position of a series, as a REBOL value.
 * @param {Store} store
 * @param {Datum} series
 * @param {number} offset - The number of items after the position. It can be negative.
 * @returns {Datum | null}
 * @standard outside - An offset that is not in the series gives null.
 * @uses readAll (src/store/store.mjs), makeItem
 * @usedby takeItems, takeFirst, pickSeries, selectValue, takeItem, pickIndex
 */
export const pickItem = (store, series, offset) => {
  // Give null if the position is not in the series.
  const all = readAll(store, series);
  const place = series.value.index + offset;
  return place < 0 || place >= all.length ? null : makeItem(series, all[place]);
};

/**
 * @uses pickItem, failMachine (src/machine/machine.mjs), giveValue (src/machine/machine.mjs)
 * @usedby takeLast, SERIES_NATIVES
 */
/**
 * Makes a table of natives that give an error if their first argument is not a series.
 * @param {Object<string, Function>} natives
 * @returns {Object<string, Function>}
 * @standard guard - A first argument that is not a series gives the error "script expect-arg".
 * @uses isSeries (src/store/store.mjs), OTHER_TYPES, failMachine (src/machine/machine.mjs),
 *   giveValue (src/machine/machine.mjs)
 * @usedby NATIVES, SERIES_NATIVES
 */
export const guardSeries = (natives) => {
  // TODO: REBOL accepts more types for some of these functions (pair!, time!).
  const guard = (native, name) => (machine, args, options) => {
    if (isSeries(args[0])) return native(machine, args, options);
    const other = OTHER_TYPES[`${name} ${args[0].type}`];
    return other === undefined ? failMachine(machine, "script expect-arg") : giveValue(machine, other(args));
  };
  return Object.fromEntries(Object.entries(natives).map(([name, native]) => [name, guard(native, name)]));
};

const DAY = 86400e9;

/**
 * @uses DAY
 * @usedby OTHER_TYPES
 */
const readMoment = (date) => date.value.days * DAY + (date.value.time ?? 0) - date.value.zone;

/**
 * @uses makeDatum (src/data/datum.mjs), readField (src/store/parts.mjs), NONE (src/store/store.mjs), readMoment
 * @usedby guardSeries
 */
const OTHER_TYPES = {
  "length? tuple": ([tuple]) => makeDatum("integer", tuple.value.length),
  "pick tuple": ([tuple, index]) => readField(tuple, index) ?? NONE,
  "difference date": ([first, second]) => makeDatum("time", readMoment(first) - readMoment(second)),
};

/**
 * @uses makeWord (src/machine/machine.mjs), failMachine (src/machine/machine.mjs), makeSeries (src/store/store.mjs),
 *   giveValue (src/machine/machine.mjs)
 * @usedby takeItem
 */
/**
 * Gives a new series as the result of a native.
 * @param {Machine} machine
 * @param {string} type - The REBOL type of the series.
 * @param {string | number[] | Datum[]} content
 * @returns {Machine}
 * @uses makeSeries (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby 20 declarations in digest, encode, files, items, random, words
 */
export const giveNew = (machine, type, content) => {
  const made = makeSeries(machine.store, type, content);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses readContext (src/store/store.mjs), makeWord (src/machine/machine.mjs), failMachine (src/machine/machine.mjs),
 *   makeSeries (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby takeItem
 */
const takeFromObject = (machine, object, offset) => {
  // The first part of an object is the block of its words. The second part is the block of their values.
  const words = ["self", ...object.value.words];
  const values = readContext(machine.store, object.value.context);
  const parts = [words.map(makeWord), words.map((word) => values[`$${word.toLowerCase()}`])];
  if (parts[offset] === undefined) return failMachine(machine, "script expect-arg");
  const made = makeSeries(machine.store, "block", parts[offset]);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses takeFromObject, readField (src/store/parts.mjs), makeDatum (src/data/datum.mjs),
 *   giveValue (src/machine/machine.mjs), NONE (src/store/store.mjs), isSeries (src/store/store.mjs),
 *   failMachine (src/machine/machine.mjs), pickItem
 * @usedby takeLast, SERIES_NATIVES
 */
const takeItem = (offset) => (machine, [series]) => {
  if (series.type === "object") return takeFromObject(machine, series, offset);
  const field = readField(series, makeDatum("integer", offset + 1));
  if (field !== undefined) return giveValue(machine, field ?? NONE);
  if (!isSeries(series)) return failMachine(machine, "script expect-arg");
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
/**
 * Makes a series value at a different position of the same series.
 * @param {Datum} series
 * @param {number} index - The position, counted from zero.
 * @returns {Datum}
 * @usedby 16 declarations in edit, items, search, series, text
 */
export const moveTo = (series, index) => ({ ...series, value: { ...series.value, index } });

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
/**
 * Makes the items that a value adds to a series. A text gets the formed value.
 * @param {Store} store
 * @param {Datum[]} pair - The series and the value.
 * @param {boolean} only - With true, a block is one item of a list.
 * @returns {string | Datum[]}
 * @standard splice - Without only, a block gives its items to a list.
 * @uses isList (src/store/store.mjs), readRest (src/store/store.mjs), formValue (src/store/mold.mjs)
 * @usedby buildContent, makeKeep, replaceInList, alterValue
 */
export const makeContent = (store, [series, value], only) => {
  // A block gives its items to a list, but with /only the block is one item.
  if (isList(series)) return isList(value) && !only ? readRest(store, value) : [value];
  const parts = isList(value) ? readRest(store, value) : [value];
  return parts.map((part) => formValue(store, part)).join("");
};

/**
 * @uses readAll (src/store/store.mjs), writeAll (src/store/store.mjs)
 * @usedby appendValue, insertValue
 */
/**
 * Puts items into a series at the position of the series value.
 * @param {Machine} machine
 * @param {Datum} series
 * @param {string | Datum[]} content
 * @returns {Machine}
 * @uses readAll (src/store/store.mjs), writeAll (src/store/store.mjs)
 * @usedby appendValue, insertValue, appendReduced, makeKeep, alterValue, appendAll
 */
export const insertContent = (machine, series, content) => {
  // Put the content at the position of the series.
  const all = readAll(machine.store, series);
  const place = series.value.index;
  const joined = all.slice(0, place).concat(content, all.slice(place));
  return { ...machine, store: writeAll(machine.store, series, joined) };
};

/**
 * @uses readAll (src/store/store.mjs), takeItem
 * @usedby SERIES_NATIVES
 */
const takeLast = (machine, [series]) => {
  const size = readAll(machine.store, series).length;
  return takeItem(size - series.value.index - 1)(machine, [series]);
};

/**
 * @uses readAll (src/store/store.mjs), giveValue (src/machine/machine.mjs), moveTo
 * @usedby SERIES_NATIVES
 */
const jump = (find) => (machine, [series, offset]) => {
  // The position stays between the head and the tail.
  const size = readAll(machine.store, series).length;
  const index = Math.min(Math.max(series.value.index + find(offset.value), 0), size);
  return giveValue(machine, moveTo(series, index));
};

/**
 * @uses readAll (src/store/store.mjs), writeAll (src/store/store.mjs)
 * @usedby pokeItem, changeValue, removeItem
 */
/**
 * The natives for series. Each entry has the name of REBOL and the function.
 * @uses takeItem, guardSeries, pickIndex, move, measure, makeLogic (src/machine/machine.mjs),
 *   makeDatum (src/data/datum.mjs), giveValue (src/machine/machine.mjs), takeLast, jump
 * @usedby NATIVES
 */
export const SERIES_NATIVES = {
  first: takeItem(0),
  second: takeItem(1),
  third: takeItem(2),
  sixth: takeItem(5),
  seventh: takeItem(6),
  eighth: takeItem(7),
  ninth: takeItem(8),
  tenth: takeItem(9),
  fourth: takeItem(3),
  fifth: takeItem(4),
  ...guardSeries({
    pick: pickIndex,
    next: move((index) => index + 1),
    back: move((index) => index - 1),
    head: move(() => 0),
    tail: move((index, size) => size),
    "tail?": measure((index, size) => makeLogic(index >= size)),
    "empty?": measure((index, size) => makeLogic(index >= size)),
    "length?": measure((index, size) => makeDatum("integer", Math.max(size - index, 0))),
    "index?": measure((index) => makeDatum("integer", index + 1)),
    "head?": measure((index) => makeLogic(index === 0)),
  "last?": measure((index, size) => makeLogic(size - index === 1)),
    "offset?": (machine, [first, second]) => giveValue(machine, makeDatum("integer", second.value.index - first.value.index)),
    last: takeLast,
    "at": jump((offset) => (offset > 0 ? offset - 1 : offset)),
    skip: jump((offset) => offset),
  }),
};
