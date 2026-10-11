/** @import { Datum, Store, Machine } from "../types/states.mjs" */
import { isList, isSeries, makeSeries, readAll, readRest, writeAll } from "../store/store.mjs";
import { failMachine, giveValue } from "../machine/machine.mjs";
import { insertContent, makeContent, moveTo } from "./series.mjs";

/**
 * @usedby repeatContent
 */
const countUp = (size) => Array.from({ length: Math.max(size, 0) });

/**
 * Reads the size that a /part argument gives: a number of items, or the distance to a position.
 * @param {Datum} series - The series that the size is for.
 * @param {Datum} range - An integer or a position in the same series.
 * @returns {number}
 * @standard position - A position gives the number of items between the two positions.
 * @usedby copySeries, insertValue, changeValue, removeItems, reverseItems, takeItems, listPlaces, changeCase
 */
export const readPart = (series, range) =>
  typeof range.value === "number" ? Math.trunc(range.value) : range.value.index - series.value.index;

/**
 * @uses readAll (src/store/store.mjs)
 * @usedby copySeries
 */
const makeSpan = (store, series, size) => {
  // A negative size gives the items before the position. The span stays in the series.
  const index = series.value.index;
  const from = Math.max(Math.min(index, index + size), 0);
  return { from, upto: Math.min(Math.max(index, index + size), readAll(store, series).length) };
};

const COPY_LIMIT = 200;

/**
 * @uses COPY_LIMIT, makeSeries (src/store/store.mjs), isSeries (src/store/store.mjs), readRest (src/store/store.mjs)
 * @usedby copySeries
 */
const copyDeep = (store, series, depth) => {
  // Each series in a list is also copied. A block that holds itself has no end, thus the copy stops at a large depth.
  const { type, content } = series;
  if (depth > COPY_LIMIT) return makeSeries(store, type, type === "binary" || typeof content !== "string" ? [] : "");
  if (typeof content === "string" || type === "binary") return makeSeries(store, type, content);
  const copyItem = (made, item) => {
    const inner = { type: item.type, content: isSeries(item) ? readRest(made.store, item) : null };
    const next = isSeries(item) ? copyDeep(made.store, inner, depth + 1) : { store: made.store, value: item };
    return { store: next.store, values: [...made.values, next.value] };
  };
  const made = content.reduce(copyItem, { store, values: [] });
  return makeSeries(made.store, type, made.values);
};

/**
 * @uses readPart, makeSpan, readAll (src/store/store.mjs), makeSeries (src/store/store.mjs), copyDeep,
 *   giveValue (src/machine/machine.mjs)
 * @usedby EDIT_NATIVES
 */
const copySeries = (machine, [series], options) => {
  const size = options.$part === undefined ? Infinity : readPart(series, options.$part[0]);
  const span = makeSpan(machine.store, series, size);
  const content = readAll(machine.store, series).slice(span.from, span.upto);
  const made = options.$deep === undefined ? makeSeries(machine.store, series.type, content) : copyDeep(machine.store, { type: series.type, content }, 0);
  // A copy of an image keeps the size. A part of an image is one row of pixels.
  const extent = options.$part === undefined ? series.value.size : [content.length, Math.min(content.length, 1)];
  const value = series.type === "image" ? { ...made.value, value: { ...made.value.value, size: extent } } : made.value;
  return giveValue({ ...machine, store: made.store }, value);
};

/**
 * @uses countUp
 * @usedby insertValue, changeValue
 */
const repeatContent = (content, options) => {
  // With /dup, the content is there a number of times.
  if (options.$dup === undefined) return content;
  const count = Math.max(options.$dup[0].value, 0);
  return typeof content === "string" ? content.repeat(count) : countUp(count).flatMap(() => content);
};

/**
 * @uses makeContent
 * @usedby appendValue, insertValue, changeValue
 */
const buildContent = (machine, args, options) => makeContent(machine.store, args, options.$only !== undefined);

/**
 * @uses moveTo, readAll (src/store/store.mjs), giveValue (src/machine/machine.mjs), insertContent, buildContent
 * @usedby EDIT_NATIVES
 */
const appendValue = (machine, args, options) => {
  // The result is the head of the series.
  const tail = moveTo(args[0], readAll(machine.store, args[0]).length);
  return giveValue(insertContent(machine, tail, buildContent(machine, args, options)), moveTo(args[0], 0));
};

/**
 * @uses buildContent, readPart, repeatContent, giveValue (src/machine/machine.mjs), insertContent, moveTo
 * @usedby EDIT_NATIVES
 */
const insertValue = (machine, args, options) => {
  // With /part, only the first items of the value go into the series. The result is the position after them.
  const full = buildContent(machine, args, options);
  const limit = options.$part === undefined ? full.length : Math.max(readPart(args[1], options.$part[0]), 0);
  const content = repeatContent(full.slice(0, limit), options);
  return giveValue(insertContent(machine, args[0], content), moveTo(args[0], args[0].value.index + content.length));
};

/**
 * Puts new items in the position of a number of old items of a series.
 * @param {Machine} machine
 * @param {Datum} series
 * @param {{ content: string | Datum[], size: number }} change - The new items and the number of old items.
 * @returns {Machine}
 * @uses readAll (src/store/store.mjs), writeAll (src/store/store.mjs)
 * @usedby 10 declarations in edit, items, search
 */
export const replaceItems = (machine, series, change) => {
  const all = readAll(machine.store, series);
  const place = series.value.index;
  const joined = all.slice(0, place).concat(change.content, all.slice(place + change.size));
  return { ...machine, store: writeAll(machine.store, series, joined) };
};

/**
 * @uses repeatContent, buildContent, readPart, replaceItems, giveValue (src/machine/machine.mjs), moveTo
 * @usedby EDIT_NATIVES
 */
const changeValue = (machine, args, options) => {
  // Without /part, the new items replace the same number of old items. The result is the position after them.
  const content = repeatContent(buildContent(machine, args, options), options);
  const size = options.$part === undefined ? content.length : Math.max(readPart(args[0], options.$part[0]), 0);
  const changed = replaceItems(machine, args[0], { content, size });
  return giveValue(changed, moveTo(args[0], args[0].value.index + content.length));
};

/**
 * @uses readPart, giveValue (src/machine/machine.mjs), replaceItems
 * @usedby EDIT_NATIVES
 */
const removeItems = (machine, [series], options) => {
  const size = options.$part === undefined ? 1 : Math.max(readPart(series, options.$part[0]), 0);
  return giveValue(replaceItems(machine, series, { content: [], size }), series);
};

/**
 * @uses readAll (src/store/store.mjs), giveValue (src/machine/machine.mjs), writeAll (src/store/store.mjs)
 * @usedby EDIT_NATIVES
 */
const clearRest = (machine, [series]) => {
  const all = readAll(machine.store, series);
  return giveValue({ ...machine, store: writeAll(machine.store, series, all.slice(0, series.value.index)) }, series);
};

/**
 * @uses readAll (src/store/store.mjs), failMachine (src/machine/machine.mjs), isList (src/store/store.mjs),
 *   giveValue (src/machine/machine.mjs), replaceItems, moveTo
 * @usedby EDIT_NATIVES
 */
const pokeItem = (machine, [series, index, value]) => {
  const place = series.value.index + index.value - 1;
  const inside = index.value > 0 && place < readAll(machine.store, series).length;
  if (!inside) return failMachine(machine, "script out-of-range", [index]);
  // A pixel of an image is a tuple. A color without an alpha part gets the alpha 0, which is not transparent in REBOL.
  const pixel = [value.value?.[0] ?? 0, value.value?.[1] ?? 0, value.value?.[2] ?? 0, value.value?.[3] ?? 0];
  const item = series.type === "image" ? [pixel] : [value];
  const content = isList(series) || series.type === "image" ? item : String.fromCharCode(value.value);
  return giveValue(replaceItems(machine, moveTo(series, place), { content, size: 1 }), value);
};

/**
 * @uses readRest (src/store/store.mjs), readPart, giveValue (src/machine/machine.mjs), replaceItems
 * @usedby EDIT_NATIVES
 */
const reverseItems = (machine, [series], options) => {
  // The items from the position are put in the opposite sequence. With /part, only the first items are.
  const rest = readRest(machine.store, series);
  const size = options.$part === undefined ? rest.length : Math.max(readPart(series, options.$part[0]), 0);
  const turned = [...rest.slice(0, size)].reverse();
  const content = typeof rest === "string" ? turned.join("") : turned;
  return giveValue(replaceItems(machine, series, { content, size: content.length }), series);
};

/**
 * The natives that change or copy a series. Each entry has the name of REBOL and the function.
 * @uses copySeries, appendValue, insertValue, changeValue, removeItems, clearRest, pokeItem, reverseItems
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const EDIT_NATIVES = {
  copy: copySeries,
  append: appendValue,
  insert: insertValue,
  change: changeValue,
  remove: removeItems,
  clear: clearRest,
  poke: pokeItem,
  reverse: reverseItems,
};
