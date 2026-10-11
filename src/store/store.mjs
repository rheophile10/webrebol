/** @import { Datum, Store } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";

const LIST_TYPES = ["block", "paren", "path", "set-path", "lit-path"];
const TEXT_TYPES = ["string", "file", "email", "url", "tag", "issue"];
const WORD_TYPES = ["word", "set-word", "get-word", "lit-word", "refinement"];

export const GLOBAL = 0;
/**
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby 11 declarations in call, evaluate, machine, control, text, store
 */
export const UNSET = makeDatum("unset", null);
/**
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby makeArguments (src/machine/call.mjs), selectPart (src/machine/evaluate.mjs),
 *   forEach (src/natives/control.mjs), loopWhile (src/natives/control.mjs), chooseBlock (src/natives/control.mjs),
 *   CONSTANTS (src/natives/globals.mjs), pickIndex (src/natives/series.mjs)
 */
export const NONE = makeDatum("none", null);
/**
 * @uses GLOBAL
 * @usedby START_STORE (src/natives/globals.mjs), moldSource (test/load.test.mjs)
 */
export const EMPTY_STORE = { series: {}, contexts: { [GLOBAL]: {} }, next: 1, output: "" };

/**
 * Makes the key of a word in a context. The key ignores the case of the letters.
 * @param {string} name - The spelling of the word.
 * @returns {string}
 * @usedby selectPart (src/machine/evaluate.mjs), evaluatePath (src/machine/evaluate.mjs),
 *   addEntry (src/machine/spec.mjs), bindLoop (src/natives/control.mjs), GLOBALS (src/natives/globals.mjs), readWord,
 *   writeWord, copyBound
 */
export const makeKey = (name) => `$${name.toLowerCase()}`;

/**
 * Finds if a value is a block, a paren or a path.
 * @param {Datum} value
 * @returns {boolean}
 * @uses LIST_TYPES
 * @usedby 9 declarations in evaluate, compare, control, series, mold, store
 */
export const isList = (value) => LIST_TYPES.includes(value.type);

/**
 * Finds if a value is a series of characters.
 * @param {Datum} value
 * @returns {boolean}
 * @uses TEXT_TYPES
 * @usedby areEqual (src/natives/compare.mjs), readOrder (src/natives/compare.mjs), makeItem (src/natives/series.mjs),
 *   isSeries
 */
export const isText = (value) => TEXT_TYPES.includes(value.type);

/**
 * Finds if a value is a series.
 * @param {Datum} value
 * @returns {boolean}
 * @uses isList, isText
 * @usedby allocate
 */
export const isSeries = (value) => isList(value) || isText(value) || value.type === "binary";

/**
 * Puts a new series into a store.
 * @param {Store} store
 * @param {string} type - The REBOL type of the series.
 * @param {string | number[] | Datum[]} content - The items of the series.
 * @returns {{ store: Store, value: Datum }}
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby makeDoes (src/natives/control.mjs), giveBlock (src/natives/control.mjs),
 *   copySeries (src/natives/series.mjs), giveText (src/natives/text.mjs), allocate, bindCopy
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
 * @usedby doText (src/natives/control.mjs), EMPTY_BLOCK (src/natives/interpret.mjs),
 *   interpretSource (src/natives/interpret.mjs), allocateItem, moldSource (test/load.test.mjs),
 *   makeReady (test/machine.test.mjs)
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
 * @usedby 16 declarations in evaluate, compare, control, series, mold, store
 */
export const readRest = (store, series) => store.series[series.value.id].slice(series.value.index);

/**
 * Gets all the items of a series, also the items before its position.
 * @param {Store} store
 * @param {Datum} series
 * @returns {string | number[] | Datum[]}
 * @usedby pickItem (src/natives/series.mjs), move (src/natives/series.mjs), measure (src/natives/series.mjs),
 *   insertContent (src/natives/series.mjs), appendValue (src/natives/series.mjs)
 */
export const readAll = (store, series) => store.series[series.value.id];

/**
 * Makes a store in which a series has new content.
 * @param {Store} store
 * @param {Datum} series
 * @param {string | number[] | Datum[]} content
 * @returns {Store}
 * @usedby insertContent (src/natives/series.mjs)
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
 * @usedby readOperator (src/machine/call.mjs), evaluateWord (src/machine/evaluate.mjs),
 *   evaluatePath (src/machine/evaluate.mjs), EVALUATORS (src/machine/evaluate.mjs)
 */
export const readWord = (store, word) => store.contexts[word.bind]?.[makeKey(word.value)] ?? UNSET;

/**
 * Makes a store in which a word has a new value.
 * @param {Store} store
 * @param {Datum} word
 * @param {Datum} value
 * @returns {Store}
 * @uses makeKey
 * @usedby stepSet (src/machine/evaluate.mjs), stepList (src/natives/control.mjs)
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
 * @usedby restoreBody (src/machine/call.mjs), invokeBody (src/machine/call.mjs), bindLoop (src/natives/control.mjs),
 *   makeFunction (src/natives/control.mjs), START_STORE (src/natives/globals.mjs)
 */
export const writeContext = (store, context, values) => ({
  ...store,
  contexts: { ...store.contexts, [context]: values },
});

/**
 * @uses isList, bindCopy, WORD_TYPES, makeKey
 * @usedby bindCopy
 */
const copyBound = (store, item, context) => {
  // Copy a list. Give the context to a word that the context has.
  if (isList(item)) return bindCopy(store, item, context);
  const bound = WORD_TYPES.includes(item.type) && context.keys.includes(makeKey(item.value));
  return { store, value: bound ? { ...item, bind: context.id } : item };
};

/**
 * Copies a block and its inner blocks, and binds the words of one context in the copy.
 * @param {Store} store
 * @param {Datum} block
 * @param {{ id: number, keys: string[] }} context - The number of the context and the keys of its words.
 * @returns {{ store: Store, value: Datum }}
 * @standard original - The first block does not change.
 * @uses copyBound, readRest, makeSeries
 * @usedby bindLoop (src/natives/control.mjs), makeFunction (src/natives/control.mjs), copyBound
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
