import { makeDatum } from "../data/datum.mjs";
import { GLOBAL, NONE, UNSET, bindCopy, bindInPlace, isList, isSeries, makeContext, makeKey, makeSeries, readRest, readWord, writeContext, writeWord } from "../store/store.mjs";
import { CONVERT_NATIVES } from "./convert.mjs";
import { makeError } from "./faults.mjs";
import { failMachine, giveValue, makeLogic, popFrame, pushFrame, startBlock } from "../machine/machine.mjs";

/**
 * @uses makeKey (src/store/store.mjs)
 * @usedby makeObject
 */
const SELF = makeKey("self");

/**
 * @uses makeKey (src/store/store.mjs)
 * @usedby makeObject
 */
const isFirstUse = (name, place, names) => names.findIndex((other) => makeKey(other) === makeKey(name)) === place;

/**
 * @uses bindCopy (src/store/store.mjs), isSeries (src/store/store.mjs), makeSeries (src/store/store.mjs),
 *   readRest (src/store/store.mjs)
 * @usedby copyParent
 */
const copyValue = (store, value, context) => {
  // A function of the parent gets a body that uses the new object. A series is copied.
  if (value.type === "function") {
    const bound = bindCopy(store, value.value.body, context);
    return { store: bound.store, value: { ...value, value: { ...value.value, body: bound.value } } };
  }
  return isSeries(value) ? makeSeries(store, value.type, readRest(store, value)) : { store, value };
};

/**
 * @uses copyValue
 * @usedby makeObject
 */
const copyParent = (store, parent, context) => {
  // Without a parent, there are no values to copy.
  const copyEntry = (made, [key, value]) => {
    const copied = copyValue(made.store, value, context);
    return { store: copied.store, values: { ...made.values, [key]: copied.value } };
  };
  const entries = parent === null ? [] : Object.entries(store.contexts[parent.value.context]);
  return entries.reduce(copyEntry, { store, values: {} });
};

/**
 * @uses readRest (src/store/store.mjs), isFirstUse, makeContext (src/store/store.mjs),
 *   makeDatum (src/data/datum.mjs), SELF, makeKey (src/store/store.mjs), copyParent, NONE (src/store/store.mjs),
 *   writeContext (src/store/store.mjs), bindCopy (src/store/store.mjs), giveValue (src/machine/machine.mjs),
 *   popFrame (src/machine/machine.mjs), startBlock (src/machine/machine.mjs), pushFrame (src/machine/machine.mjs)
 * @usedby MAKERS, makeValue, OBJECT_NATIVES
 */
const makeObject = (machine, parent, block) => {
  // The words of the object are the words of its parent and the set-words of the block.
  const added = readRest(machine.store, block).filter((item) => item.type === "set-word");
  const words = [...(parent?.value.words ?? []), ...added.map((item) => item.value)].filter(isFirstUse);
  const made = makeContext(machine.store, {});
  const object = makeDatum("object", { context: made.id, words });
  const context = { id: made.id, keys: [SELF, ...words.map(makeKey)] };
  // Each word starts as none, or with the value of the parent. `self` is the object.
  const copied = copyParent(made.store, parent, context);
  const empty = Object.fromEntries(context.keys.map((key) => [key, NONE]));
  const store = writeContext(copied.store, made.id, { ...empty, ...copied.values, [SELF]: object });
  const bound = bindCopy(store, block, context);
  const frame = { step: (current) => giveValue(popFrame(current), object) };
  return startBlock(pushFrame({ ...machine, store: bound.store }, frame), bound.value);
};

/**
 * @uses isList (src/store/store.mjs), isSeries (src/store/store.mjs), readRest (src/store/store.mjs),
 *   makeSeries (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby MAKERS
 */
const giveSeries = (type, empty) => (machine, spec) => {
  // A series of the same family gives a copy. Other values give an empty series.
  const content = isList(spec) === (type === "block") && isSeries(spec) ? readRest(machine.store, spec) : empty;
  const made = makeSeries(machine.store, type, content);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses makeObject, giveSeries, makeError, CONVERT_NATIVES
 * @usedby makeValue
 */
const MAKERS = {
  object: (machine, spec) => makeObject(machine, null, spec),
  block: giveSeries("block", []),
  string: giveSeries("string", ""),
  error: makeError,
  integer: (machine, spec) => CONVERT_NATIVES["to-integer"](machine, [spec]),
  decimal: (machine, spec) => CONVERT_NATIVES["to-decimal"](machine, [spec]),
};

/**
 * @uses makeObject, CONVERT_NATIVES, MAKERS, failMachine (src/machine/machine.mjs)
 * @usedby OBJECT_NATIVES
 */
const makeValue = (machine, [type, spec]) => {
  if (type.type === "object") return makeObject(machine, type, spec);
  if (type.value === "block" && spec.type === "string") return CONVERT_NATIVES["to-block"](machine, [spec]);
  const maker = type.type === "datatype" ? MAKERS[type.value] : undefined;
  return maker === undefined ? failMachine(machine, "script bad-make-arg") : maker(machine, spec);
};

/**
 * @uses makeKey (src/store/store.mjs), giveValue (src/machine/machine.mjs), NONE (src/store/store.mjs)
 * @usedby OBJECT_NATIVES
 */
const findInObject = (machine, [object, word]) => {
  const found = machine.store.contexts[object.value.context][makeKey(word.value)] !== undefined;
  return giveValue(machine, found ? { ...word, type: "word", bind: object.value.context } : NONE);
};

/**
 * @uses readRest (src/store/store.mjs), writeWord (src/store/store.mjs), NONE (src/store/store.mjs),
 *   giveValue (src/machine/machine.mjs)
 * @usedby OBJECT_NATIVES
 */
const setWords = (machine, [target, value]) => {
  // A block of words takes the items of a block of values. Without a block of values, each word gets the value.
  const words = target.type === "block" ? readRest(machine.store, target) : [target];
  const values = target.type === "block" && value.type === "block" ? readRest(machine.store, value) : null;
  const assign = (store, word, place) => writeWord(store, word, values === null ? value : (values[place] ?? NONE));
  return giveValue({ ...machine, store: words.reduce(assign, machine.store) }, value);
};

/**
 * @uses GLOBAL (src/store/store.mjs)
 * @usedby bindBlock
 */
const findContext = (store, target) => {
  // All words can go to the global context. A different context accepts only its words.
  const id = target.type === "object" ? target.value.context : target.bind;
  return { id, keys: id === GLOBAL ? null : Object.keys(store.contexts[id]).filter((key) => key.startsWith("$")) };
};

/**
 * @uses findContext, giveValue (src/machine/machine.mjs), bindInPlace (src/store/store.mjs),
 *   bindCopy (src/store/store.mjs)
 * @usedby OBJECT_NATIVES
 */
const bindBlock = (machine, [block, target], options) => {
  const context = findContext(machine.store, target);
  if (options.$copy === undefined) return giveValue({ ...machine, store: bindInPlace(machine.store, block, context) }, block);
  const bound = bindCopy(machine.store, block, context);
  return giveValue({ ...machine, store: bound.store }, bound.value);
};

/**
 * @uses readRest (src/store/store.mjs), makeKey (src/store/store.mjs), makeContext (src/store/store.mjs),
 *   NONE (src/store/store.mjs), bindCopy (src/store/store.mjs), startBlock (src/machine/machine.mjs)
 * @usedby OBJECT_NATIVES
 */
const useWords = (machine, [words, body]) => {
  // The words are in a new context. The body is a copy that uses this context.
  const keys = readRest(machine.store, words).map((word) => makeKey(word.value));
  const made = makeContext(machine.store, Object.fromEntries(keys.map((key) => [key, NONE])));
  const bound = bindCopy(made.store, body, { id: made.id, keys });
  return startBlock({ ...machine, store: bound.store }, bound.value);
};

/**
 * The natives for objects, words and contexts. Each entry has the name of REBOL and the function.
 * @uses makeValue, makeObject, findInObject, giveValue (src/machine/machine.mjs), readWord (src/store/store.mjs),
 *   setWords, makeLogic (src/machine/machine.mjs), writeWord (src/store/store.mjs), UNSET (src/store/store.mjs),
 *   bindBlock, useWords
 * @usedby NATIVES
 */
export const OBJECT_NATIVES = {
  make: makeValue,
  context: (machine, [block]) => makeObject(machine, null, block),
  "in": findInObject,
  get: (machine, [word]) => giveValue(machine, readWord(machine.store, word)),
  set: setWords,
  "value?": (machine, [word]) => giveValue(machine, makeLogic(readWord(machine.store, word).type !== "unset")),
  unset: (machine, [word]) => giveValue({ ...machine, store: writeWord(machine.store, word, UNSET) }, UNSET),
  bind: bindBlock,
  use: useWords,
};
