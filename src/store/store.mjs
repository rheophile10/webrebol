/** @import { Datum, Store } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { unpackPixel } from "../data/pixels.mjs";
import { EMPTY_CHUNKS, joinChunks, pushItem } from "../data/chunks.mjs";
import { EMPTY_DISK } from "./disk.mjs";
import { EMPTY_TABLE, readEntry, writeEntry } from "./table.mjs";

const LIST_TYPES = ["block", "paren", "path", "set-path", "lit-path", "hash", "list"];
const TEXT_TYPES = ["string", "file", "email", "url", "tag", "issue"];
const WORD_TYPES = ["word", "set-word", "get-word", "lit-word", "refinement"];

export const GLOBAL = 0;
/**
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby 23 declarations in call, evaluate, machine, control, files, items, loops, objects, random, text, store, windows
 */
export const UNSET = makeDatum("unset", null);
/**
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby 56 declarations in call, path, bitsets, control, crypto, encode, faults, files, flow, items, loops, objects, parse, random, report, search, series, words, globals, interpret, layout
 */
export const NONE = makeDatum("none", null);
/**
 * @uses EMPTY_TABLE, writeEntry, GLOBAL, EMPTY_DISK
 * @usedby loadScript (bin/compare.mjs), START_STORE (src/session/globals.mjs), moldSource (test/load.test.mjs)
 */
export const EMPTY_STORE = {
  series: EMPTY_TABLE,
  contexts: writeEntry(EMPTY_TABLE, GLOBAL, {}),
  globals: EMPTY_TABLE,
  base: {},
  next: 1,
  output: "",
  disk: EMPTY_DISK,
  directory: "/",
  started: 0,
  seed: 1,
  windows: [],
  dirty: false,
};

/**
 * Makes the key of a word in a context. The key ignores the case of the letters.
 * @param {string} name - The spelling of the word.
 * @returns {string}
 * @usedby 23 declarations in path, spec, loops, objects, words, globals, store
 */
export const makeKey = (name) => `$${name.toLowerCase()}`;

const HASH_MASK = 0xfffff;

/**
 * @uses HASH_MASK
 * @usedby readWord, writeWord
 */
const hashKey = (key) => [...key].reduce((sum, char) => (Math.imul(sum, 31) + char.charCodeAt(0)) | 0, 7) & HASH_MASK;

/**
 * Finds if a value is a block, a paren or a path.
 * @param {Datum} value
 * @returns {boolean}
 * @uses LIST_TYPES
 * @usedby 38 declarations in compare, path, control, convert, crypto, edit, encode, files, items, objects, random, search, series, text, words, mold, store, elements
 */
export const isList = (value) => LIST_TYPES.includes(value.type);

/**
 * Finds if a value is a series of characters.
 * @param {Datum} value
 * @returns {boolean}
 * @uses TEXT_TYPES
 * @usedby 15 declarations in path, bitsets, compare, convert, faults, parse, series, store, elements
 */
export const isText = (value) => TEXT_TYPES.includes(value.type);

/**
 * Finds if a value is a series.
 * @param {Datum} value
 * @returns {boolean}
 * @uses isList, isText
 * @usedby 9 declarations in edit, items, objects, random, series, text, store
 */
export const isSeries = (value) => isList(value) || isText(value) || value.type === "binary" || value.type === "image";

/**
 * Puts a new series into a store.
 * @param {Store} store
 * @param {string} type - The REBOL type of the series.
 * @param {string | number[] | Datum[]} content - The items of the series.
 * @returns {{ store: Store, value: Datum }}
 * @uses writeEntry, makeDatum (src/data/datum.mjs)
 * @usedby 48 declarations in call, control, convert, crypto, edit, encode, files, flow, items, objects, parse, search, series, text, words, store, elements, layout, windows
 */
export const makeSeries = (store, type, content) => ({
  store: { ...store, series: writeEntry(store.series, store.next, content), next: store.next + 1 },
  value: makeDatum(type, { id: store.next, index: 0 }),
});

/**
 * @usedby allocate
 */
const placeSeries = (made, datum) => {
  // A construct can give a position to its series. An image keeps its size with its series.
  const extra = { ...(datum.index === undefined ? {} : { index: datum.index }), ...(datum.size === undefined ? {} : { size: datum.size }) };
  return { store: made.store, value: { ...made.value, value: { ...made.value.value, ...extra } } };
};

/**
 * @uses allocate, pushItem (src/data/chunks.mjs)
 * @usedby allocate
 */
const allocateItem = (made, item) => {
  // Put the item into the store that the items before it made.
  const next = allocate(made.store, item);
  return { store: next.store, values: pushItem(made.values, next.value) };
};

/**
 * Moves a loaded value into a store. Each series gets a number, and each word gets the global context.
 * @param {Store} store
 * @param {Datum} datum - A value from the loader.
 * @returns {{ store: Store, value: Datum }}
 * @uses LIST_TYPES, allocateItem, EMPTY_CHUNKS (src/data/chunks.mjs), placeSeries, makeSeries,
 *   joinChunks (src/data/chunks.mjs), splitRows, isSeries, WORD_TYPES, GLOBAL
 * @usedby 16 declarations in compare, conform, control, convert, files, objects, words, globals, interpret, store, layout, windows, load, machine
 */
export const allocate = (store, datum) => {
  // A list holds values that also go into the store.
  if (LIST_TYPES.includes(datum.type)) {
    const made = datum.value.reduce(allocateItem, { store, values: EMPTY_CHUNKS });
    return placeSeries(makeSeries(made.store, datum.type, joinChunks(made.values)), datum);
  }
  // An image from the loader has one list of pixels. The store keeps it in rows.
  const content = datum.type === "image" ? splitRows(datum.value, datum.size[0]) : datum.value;
  if (isSeries(datum)) return placeSeries(makeSeries(store, datum.type, content), datum);
  return { store, value: WORD_TYPES.includes(datum.type) ? { ...datum, bind: GLOBAL } : datum };
};

/**
 * Gets the items of a series from its position to its end.
 * @param {Store} store
 * @param {Datum} series
 * @returns {string | number[] | Datum[]}
 * @uses readAll
 * @usedby 99 declarations in compare, conform, path, bitsets, control, convert, crypto, digest, edit, encode, faults, files, flow, items, loops, objects, parse, random, search, series, strings, text, words, mold, store, elements, layout, raster, windows, view
 */
export const readRest = (store, series) => readAll(store, series).slice(series.value.index);

/**
 * Gets all the items of a series, also the items before its position.
 * @param {Store} store
 * @param {Datum} series
 * @returns {string | number[] | Datum[]}
 * @uses readEntry
 * @usedby 26 declarations in path, edit, encode, items, loops, parse, search, series, strings, text, store
 */
export const readAll = (store, series) => {
  // The pixels of an image are in rows. Thus this function is slow for an image, and the image functions read the rows.
  const content = readEntry(store.series, series.value.id);
  return series.type === "image" ? content.flat() : content;
};

/**
 * Splits the pixels of an image into its rows.
 * @param {number[]} pixels
 * @param {number} width - The number of pixels in one row.
 * @returns {number[][]}
 * @standard rows - Each row has the width of the image. Only the last row can be shorter.
 * @usedby copySeries (src/natives/edit.mjs), allocate, writeAll
 */
export const splitRows = (pixels, width) => {
  const span = Math.max(width, 1);
  return Array.from({ length: Math.ceil(pixels.length / span) }, (unused, row) => pixels.slice(row * span, (row + 1) * span));
};

/**
 * Counts all the items of a series, also the items before its position.
 * @param {Store} store
 * @param {Datum} series
 * @returns {number}
 * @standard image - An image has one item for each pixel.
 * @uses readEntry
 * @usedby pokeItem (src/natives/edit.mjs), move (src/natives/series.mjs), measure (src/natives/series.mjs),
 *   takeLast (src/natives/series.mjs), jump (src/natives/series.mjs)
 */
export const countItems = (store, series) => {
  const content = readEntry(store.series, series.value.id);
  if (series.type !== "image") return content.length;
  // All the rows before the last row have the same length.
  return content.length === 0 ? 0 : (content.length - 1) * content[0].length + content[content.length - 1].length;
};

/**
 * Makes a store in which a series has new content.
 * @param {Store} store
 * @param {Datum} series
 * @param {string | number[] | Datum[]} content
 * @returns {Store}
 * @uses writeEntry, splitRows
 * @usedby assignInSeries (src/machine/path.mjs), replaceItems (src/natives/edit.mjs),
 *   clearRest (src/natives/edit.mjs), changeText (src/natives/encode.mjs), insertContent (src/natives/series.mjs),
 *   writeRest (src/natives/strings.mjs), bindInPlace
 */
export const writeAll = (store, series, content) => ({
  ...store,
  series: writeEntry(store.series, series.value.id, series.type === "image" ? splitRows(content, series.value.size[0]) : content),
});

/**
 * Gets the value of a word from its context.
 * @param {Store} store
 * @param {Datum} word
 * @returns {Datum}
 * @standard unset - A word without a value gives the unset value.
 * @uses makeKey, GLOBAL, readEntry, hashKey, UNSET
 * @usedby 19 declarations in call, evaluate, path, control, items, loops, objects, parse, words, layout
 */
export const readWord = (store, word) => {
  // The global words that the session set are in a table by the hash of the key. The base has the words of REBOL.
  const key = makeKey(word.value);
  if (word.bind === GLOBAL) return readEntry(store.globals, hashKey(key))?.[key] ?? store.base[key] ?? UNSET;
  return (word.bind === undefined ? undefined : readEntry(store.contexts, word.bind)?.[key]) ?? UNSET;
};

/**
 * Gets the values of the words of a context, by key. For the global context, it gives only the words that the session set.
 * @param {Store} store
 * @param {number} context - The number of the context.
 * @returns {Object<string, Datum> | undefined}
 * @uses readEntry
 * @usedby 19 declarations in call, path, objects, series, words, mold, elements, layout, windows
 */
export const readContext = (store, context) => readEntry(store.contexts, context);

/**
 * Makes a store in which a word has a new value.
 * @param {Store} store
 * @param {Datum} word
 * @param {Datum} value
 * @returns {Store}
 * @uses makeKey, GLOBAL, readEntry, hashKey, writeEntry
 * @usedby 14 declarations in evaluate, path, items, loops, objects, parse, words, layout, windows
 */
export const writeWord = (store, word, value) => {
  // A global word changes only the small group of words that have the same hash.
  const key = makeKey(word.value);
  if (word.bind === GLOBAL) {
    const group = { ...readEntry(store.globals, hashKey(key)), [key]: value };
    return { ...store, globals: writeEntry(store.globals, hashKey(key), group) };
  }
  return { ...store, contexts: writeEntry(store.contexts, word.bind, { ...readEntry(store.contexts, word.bind), [key]: value }) };
};

/**
 * Makes a store in which a context has new values for all its words.
 * @param {Store} store
 * @param {number} context - The number of the context.
 * @param {Object<string, Datum>} values
 * @returns {Store}
 * @uses writeEntry
 * @usedby restoreBody (src/machine/call.mjs), invokeBody (src/machine/call.mjs),
 *   assignInObject (src/machine/path.mjs), makeObject (src/natives/objects.mjs), setFields (src/natives/objects.mjs),
 *   makeContext, changeText (src/view/windows.mjs)
 */
export const writeContext = (store, context, values) => ({
  ...store,
  contexts: writeEntry(store.contexts, context, values),
});

/**
 * @uses makeKey, WORD_TYPES
 * @usedby copyBound, bindInPlace
 */
const bindWord = (item, context) => {
  // A context without a list of keys accepts all words.
  const accepted = context.keys === null || context.keys.includes(makeKey(String(item.value)));
  return WORD_TYPES.includes(item.type) && accepted ? { ...item, bind: context.id } : item;
};

/**
 * @uses isList, bindCopy, bindWord
 * @usedby bindCopy
 */
const copyBound = (store, item, context) =>
  isList(item) ? bindCopy(store, item, context) : { store, value: bindWord(item, context) };

/**
 * Copies a block and its inner blocks, and binds the words of one context in the copy.
 * @param {Store} store
 * @param {Datum} block
 * @param {{ id: number, keys: string[] | null }} context - The number of the context and the keys of its words.
 * @returns {{ store: Store, value: Datum }}
 * @standard original - The first block does not change.
 * @uses copyBound, readRest, makeSeries
 * @usedby 9 declarations in call, control, items, loops, objects, store
 */
export const bindCopy = (store, block, context) => {
  // Copy each item into the store that the items before it made.
  const copyItem = (made, item) => {
    const next = copyBound(made.store, item, context);
    return { store: next.store, values: [...made.values, next.value] };
  };
  const made = readRest(store, block).reduce(copyItem, { store, values: [] });
  return makeSeries(made.store, block.type, made.values);
};

/**
 * Binds the words of one context in a block and in its inner blocks. The block itself changes.
 * @param {Store} store
 * @param {Datum} block
 * @param {{ id: number, keys: string[] | null }} context - The number of the context and the keys of its words.
 * @returns {Store}
 * @standard same - The block keeps its series number.
 * @uses readAll, writeAll, bindWord, isList
 * @usedby bindBlock (src/natives/objects.mjs)
 */
export const bindInPlace = (store, block, context) => {
  // Bind the words of this block, then do the same for each inner block.
  const all = readAll(store, block);
  const rebound = writeAll(store, block, all.map((item) => bindWord(item, context)));
  return all.filter(isList).reduce((current, inner) => bindInPlace(current, inner, context), rebound);
};

/**
 * Puts a new context into a store.
 * @param {Store} store
 * @param {Object<string, Datum>} values - The first values of the words, by key.
 * @returns {{ store: Store, id: number }}
 * @uses writeContext
 * @usedby invokeClosure (src/machine/call.mjs), makeFunction (src/natives/control.mjs),
 *   collectValues (src/natives/items.mjs), bindLoop (src/natives/loops.mjs), makeObject (src/natives/objects.mjs),
 *   useBlock (src/natives/objects.mjs), makeRecord
 */
export const makeContext = (store, values) => ({
  store: { ...writeContext(store, store.next, values), next: store.next + 1 },
  id: store.next,
});

/**
 * Puts a new object into a store. The object has the given words and values.
 * @param {Store} store
 * @param {string[]} words - The spellings of the words.
 * @param {Datum[]} values - The value of each word, in the same sequence.
 * @returns {{ store: Store, value: Datum }}
 * @standard self - The word `self` of the object gives the object.
 * @uses makeDatum (src/data/datum.mjs), makeKey, makeContext
 * @usedby disarmError (src/natives/faults.mjs), readInfo (src/natives/files.mjs),
 *   constructObject (src/natives/words.mjs), makeElement (src/view/elements.mjs), makeObject (src/view/layout.mjs)
 */
export const makeRecord = (store, words, values) => {
  const object = makeDatum("object", { context: store.next, words });
  const entries = words.map((word, place) => [makeKey(word), values[place]]);
  return { store: makeContext(store, { ...Object.fromEntries(entries), $self: object }).store, value: object };
};

/**
 * Gets the items of a series from its position, each as a REBOL value. A text gives chars, and an image gives tuples.
 * @param {Store} store
 * @param {Datum} series
 * @returns {Datum[]}
 * @uses isList, readRest, makeDatum (src/data/datum.mjs)
 * @usedby findExtreme (src/natives/items.mjs), groupValues (src/natives/loops.mjs), forEach (src/natives/loops.mjs),
 *   combine (src/natives/search.mjs), sortItems (src/natives/search.mjs)
 */
export const readValues = (store, series) => {
  if (isList(series)) return readRest(store, series);
  if (series.type === "binary") return readRest(store, series).map((byte) => makeDatum("integer", byte));
  if (series.type === "image") return readRest(store, series).map((pixel) => makeDatum("tuple", unpackPixel(pixel)));
  return [...readRest(store, series)].map((character) => makeDatum("char", character.charCodeAt(0)));
};
