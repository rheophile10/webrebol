/** @import { Datum, Store, Machine } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { NONE, isList, isText, makeSeries, readAll, readRest, writeAll } from "../store/store.mjs";
import { formValue } from "../store/mold.mjs";
import { failMachine, giveValue, makeLogic } from "../machine/machine.mjs";
import { areEqual } from "./compare.mjs";

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
 * @usedby takeItem, pickIndex, selectValue
 */
const pickItem = (store, series, offset) => {
  // Give null if the position is not in the series.
  const all = readAll(store, series);
  const place = series.value.index + offset;
  return place < 0 || place >= all.length ? null : makeItem(series, all[place]);
};

/**
 * @uses pickItem, failMachine (src/machine/machine.mjs), giveValue (src/machine/machine.mjs)
 * @usedby takeLast, SERIES_NATIVES
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
/**
 * Makes a series value at a different position of the same series.
 * @param {Datum} series
 * @param {number} index - The position, counted from zero.
 * @returns {Datum}
 * @usedby move, appendValue, insertValue, jump, pokeItem, changeValue, findValue, appendAll
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
 * @usedby appendValue, insertValue, changeValue
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
 * @usedby appendValue, insertValue, appendAll
 */
export const insertContent = (machine, series, content) => {
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
const replaceItems = (machine, series, change) => {
  // Put the content in the position of a number of old items.
  const all = readAll(machine.store, series);
  const place = series.value.index;
  const joined = all.slice(0, place).concat(change.content, all.slice(place + change.size));
  return { ...machine, store: writeAll(machine.store, series, joined) };
};

/**
 * @uses readAll (src/store/store.mjs), failMachine (src/machine/machine.mjs), isList (src/store/store.mjs),
 *   giveValue (src/machine/machine.mjs), replaceItems, moveTo
 * @usedby SERIES_NATIVES
 */
const pokeItem = (machine, [series, index, value]) => {
  const place = series.value.index + index.value - 1;
  const inside = index.value > 0 && place < readAll(machine.store, series).length;
  if (!inside) return failMachine(machine, "script out-of-range");
  const content = isList(series) ? [value] : String.fromCharCode(value.value);
  return giveValue(replaceItems(machine, moveTo(series, place), { content, size: 1 }), value);
};

/**
 * @uses makeContent, replaceItems, giveValue (src/machine/machine.mjs), moveTo
 * @usedby SERIES_NATIVES
 */
const changeValue = (machine, args) => {
  // The new items replace the same number of old items. The result is the position after them.
  const content = makeContent(machine.store, args, false);
  const changed = replaceItems(machine, args[0], { content, size: content.length });
  return giveValue(changed, moveTo(args[0], args[0].value.index + content.length));
};

/**
 * @uses giveValue (src/machine/machine.mjs), replaceItems
 * @usedby SERIES_NATIVES
 */
const removeItem = (machine, [series]) => giveValue(replaceItems(machine, series, { content: [], size: 1 }), series);

/**
 * @uses readAll (src/store/store.mjs), giveValue (src/machine/machine.mjs), writeAll (src/store/store.mjs)
 * @usedby SERIES_NATIVES
 */
const clearRest = (machine, [series]) => {
  const all = readAll(machine.store, series);
  return giveValue({ ...machine, store: writeAll(machine.store, series, all.slice(0, series.value.index)) }, series);
};

/**
 * @uses areEqual
 * @usedby findOffset
 */
const startsWith = (store, items, wanted) => (item, place) =>
  wanted.every((value, offset) => items[place + offset] !== undefined && areEqual(store, items[place + offset], value));

/**
 * @uses isList (src/store/store.mjs), readRest (src/store/store.mjs), formValue (src/store/mold.mjs), startsWith
 * @usedby findValue, selectValue
 */
const findOffset = (store, series, value) => {
  // In a text, look for the formed value without regard to case.
  if (!isList(series)) return readRest(store, series).toLowerCase().indexOf(formValue(store, value).toLowerCase());
  // In a list, a block is a sequence of items to look for. Other values are one item.
  const items = readRest(store, series);
  const wanted = value.type === "block" ? readRest(store, value) : [value];
  return wanted.length === 0 ? -1 : items.findIndex(startsWith(store, items, wanted));
};

/**
 * @uses findOffset, giveValue (src/machine/machine.mjs), NONE (src/store/store.mjs), moveTo
 * @usedby SERIES_NATIVES
 */
const findValue = (machine, [series, value]) => {
  const offset = findOffset(machine.store, series, value);
  return giveValue(machine, offset < 0 ? NONE : moveTo(series, series.value.index + offset));
};

/**
 * @uses findOffset, isList (src/store/store.mjs), readRest (src/store/store.mjs), pickItem,
 *   giveValue (src/machine/machine.mjs), NONE (src/store/store.mjs)
 * @usedby SERIES_NATIVES
 */
const selectValue = (machine, [series, value]) => {
  // The result is the item after the found value.
  const offset = findOffset(machine.store, series, value);
  const size = isList(series) && value.type === "block" ? readRest(machine.store, value).length : 1;
  const item = offset < 0 ? null : pickItem(machine.store, series, offset + size);
  return giveValue(machine, item ?? NONE);
};

/**
 * The natives for series. Each entry has the specification and the function.
 * @uses SERIES, takeItem, pickIndex, move, measure, makeLogic (src/machine/machine.mjs),
 *   makeDatum (src/data/datum.mjs), takeLast, jump, pokeItem, changeValue, removeItem, clearRest, findValue,
 *   selectValue, INSERT, appendValue, insertValue, copySeries
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
  third: [SERIES, takeItem(2)],
  fourth: [SERIES, takeItem(3)],
  fifth: [SERIES, takeItem(4)],
  last: [SERIES, takeLast],
  "at": ["series [series!] index [integer!]", jump((offset) => (offset > 0 ? offset - 1 : offset))],
  skip: ["series [series!] offset [integer!]", jump((offset) => offset)],
  poke: ["series [series!] index [integer!] value", pokeItem],
  change: ["series [series!] value", changeValue],
  remove: [SERIES, removeItem],
  clear: [SERIES, clearRest],
  find: ["series [series!] value", findValue],
  select: ["series [series!] value", selectValue],
  append: [INSERT, appendValue],
  insert: [INSERT, insertValue],
  copy: ["value [series!]", copySeries],
};
