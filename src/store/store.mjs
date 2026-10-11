/** @import { Datum, Store } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { EMPTY_DISK } from "./disk.mjs";

const LIST_TYPES = ["block", "paren", "path", "set-path", "lit-path"];
const TEXT_TYPES = ["string", "file", "email", "url", "tag", "issue"];
const WORD_TYPES = ["word", "set-word", "get-word", "lit-word", "refinement"];

export const GLOBAL = 0;
/**
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby 21 declarations in call, evaluate, machine, control, files, items, loops, objects, random, text, store
 */
export const UNSET = makeDatum("unset", null);
/**
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby 47 declarations in call, path, bitsets, control, encode, faults, files, flow, globals, interpret, items, loops, objects, parse, random, report, search, series, words
 */
export const NONE = makeDatum("none", null);
/**
 * @uses GLOBAL, EMPTY_DISK
 * @usedby START_STORE (src/natives/globals.mjs), moldSource (test/load.test.mjs)
 */
export const EMPTY_STORE = {
  series: {},
  contexts: { [GLOBAL]: {} },
  next: 1,
  output: "",
  disk: EMPTY_DISK,
  directory: "/",
  started: 0,
  seed: 1,
};

/**
 * Makes the key of a word in a context. The key ignores the case of the letters.
 * @param {string} name - The spelling of the word.
 * @returns {string}
 * @usedby 19 declarations in path, spec, globals, loops, objects, words, store
 */
export const makeKey = (name) => `$${name.toLowerCase()}`;

/**
 * Finds if a value is a block, a paren or a path.
 * @param {Datum} value
 * @returns {boolean}
 * @uses LIST_TYPES
 * @usedby 33 declarations in path, compare, control, convert, edit, encode, files, items, objects, random, search, series, text, words, mold, store
 */
export const isList = (value) => LIST_TYPES.includes(value.type);

/**
 * Finds if a value is a series of characters.
 * @param {Datum} value
 * @returns {boolean}
 * @uses TEXT_TYPES
 * @usedby 14 declarations in path, bitsets, compare, convert, faults, parse, series, store
 */
export const isText = (value) => TEXT_TYPES.includes(value.type);

/**
 * Finds if a value is a series.
 * @param {Datum} value
 * @returns {boolean}
 * @uses isList, isText
 * @usedby 9 declarations in edit, items, objects, random, series, text, store
 */
export const isSeries = (value) => isList(value) || isText(value) || value.type === "binary";

/**
 * Puts a new series into a store.
 * @param {Store} store
 * @param {string} type - The REBOL type of the series.
 * @param {string | number[] | Datum[]} content - The items of the series.
 * @returns {{ store: Store, value: Datum }}
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby 33 declarations in call, control, convert, edit, encode, files, flow, items, objects, parse, search, series, text, words, store
 */
export const makeSeries = (store, type, content) => ({
  store: { ...store, series: { ...store.series, [store.next]: content }, next: store.next + 1 },
  value: makeDatum(type, { id: store.next, index: 0 }),
});

/**
 * @uses allocate
 * @usedby allocate
 */
const allocateItem = (made, item) => {
  // Put the item into the store that the items before it made.
  const next = allocate(made.store, item);
  return { store: next.store, values: [...made.values, next.value] };
};

/**
 * Moves a loaded value into a store. Each series gets a number, and each word gets the global context.
 * @param {Store} store
 * @param {Datum} datum - A value from the loader.
 * @returns {{ store: Store, value: Datum }}
 * @uses LIST_TYPES, allocateItem, makeSeries, isSeries, WORD_TYPES, GLOBAL
 * @usedby 10 declarations in control, convert, files, interpret, words, store, load, machine
 */
export const allocate = (store, datum) => {
  // A list holds values that also go into the store.
  if (LIST_TYPES.includes(datum.type)) {
    const made = datum.value.reduce(allocateItem, { store, values: [] });
    return makeSeries(made.store, datum.type, made.values);
  }
  if (isSeries(datum)) return makeSeries(store, datum.type, datum.value);
  return { store, value: WORD_TYPES.includes(datum.type) ? { ...datum, bind: GLOBAL } : datum };
};

/**
 * Gets the items of a series from its position to its end.
 * @param {Store} store
 * @param {Datum} series
 * @returns {string | number[] | Datum[]}
 * @usedby 79 declarations in path, bitsets, compare, control, convert, digest, edit, encode, faults, files, flow, items, loops, objects, parse, random, search, series, strings, text, words, mold, store
 */
export const readRest = (store, series) => store.series[series.value.id].slice(series.value.index);

/**
 * Gets all the items of a series, also the items before its position.
 * @param {Store} store
 * @param {Datum} series
 * @returns {string | number[] | Datum[]}
 * @usedby 30 declarations in path, edit, encode, items, loops, parse, search, series, strings, text, store
 */
export const readAll = (store, series) => store.series[series.value.id];

/**
 * Makes a store in which a series has new content.
 * @param {Store} store
 * @param {Datum} series
 * @param {string | number[] | Datum[]} content
 * @returns {Store}
 * @usedby assignInSeries (src/machine/path.mjs), replaceItems (src/natives/edit.mjs),
 *   clearRest (src/natives/edit.mjs), changeText (src/natives/encode.mjs), insertContent (src/natives/series.mjs),
 *   writeRest (src/natives/strings.mjs), bindInPlace
 */
export const writeAll = (store, series, content) => ({
  ...store,
  series: { ...store.series, [series.value.id]: content },
});

/**
 * Gets the value of a word from its context.
 * @param {Store} store
 * @param {Datum} word
 * @returns {Datum}
 * @standard unset - A word without a value gives the unset value.
 * @uses makeKey, UNSET
 * @usedby 16 declarations in call, evaluate, path, items, loops, objects, parse, words
 */
export const readWord = (store, word) => store.contexts[word.bind]?.[makeKey(word.value)] ?? UNSET;

/**
 * Makes a store in which a word has a new value.
 * @param {Store} store
 * @param {Datum} word
 * @param {Datum} value
 * @returns {Store}
 * @uses makeKey
 * @usedby 11 declarations in evaluate, path, items, loops, objects, parse, words
 */
export const writeWord = (store, word, value) => ({
  ...store,
  contexts: { ...store.contexts, [word.bind]: { ...store.contexts[word.bind], [makeKey(word.value)]: value } },
});

/**
 * Makes a store in which a context has new values for all its words.
 * @param {Store} store
 * @param {number} context - The number of the context.
 * @param {Object<string, Datum>} values
 * @returns {Store}
 * @usedby restoreBody (src/machine/call.mjs), invokeBody (src/machine/call.mjs),
 *   assignInObject (src/machine/path.mjs), START_STORE (src/natives/globals.mjs),
 *   makeObject (src/natives/objects.mjs), makeContext
 */
export const writeContext = (store, context, values) => ({
  ...store,
  contexts: { ...store.contexts, [context]: values },
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
 * @usedby makeFunction (src/natives/control.mjs), collectValues (src/natives/items.mjs),
 *   bindLoop (src/natives/loops.mjs), copyValue (src/natives/objects.mjs), makeObject (src/natives/objects.mjs),
 *   bindBlock (src/natives/objects.mjs), useWords (src/natives/objects.mjs), copyBound
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
 * @usedby makeFunction (src/natives/control.mjs), collectValues (src/natives/items.mjs),
 *   bindLoop (src/natives/loops.mjs), makeObject (src/natives/objects.mjs), useWords (src/natives/objects.mjs),
 *   makeRecord
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
 *   constructObject (src/natives/words.mjs)
 */
export const makeRecord = (store, words, values) => {
  const object = makeDatum("object", { context: store.next, words });
  const entries = words.map((word, place) => [makeKey(word), values[place]]);
  return { store: makeContext(store, { ...Object.fromEntries(entries), $self: object }).store, value: object };
};

/**
 * Gets the items of a series from its position, each as a REBOL value. A text gives chars.
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
  return [...readRest(store, series)].map((character) => makeDatum("char", character.charCodeAt(0)));
};
