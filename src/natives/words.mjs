import { makeDatum } from "../data/datum.mjs";
import { loadSource } from "../data/load.mjs";
import { allocate, GLOBAL, isList, makeKey, makeRecord, makeSeries, NONE, readContext, readRest, readWord, writeWord } from "../store/store.mjs";
import { moldValue } from "../store/mold.mjs";
import { askEdge, failMachine, giveValue, isTrue, makeLogic, makeWord, popFrame, pushFrame, startBlock, throwValue } from "../machine/machine.mjs";
import { callFunction } from "../machine/call.mjs";
import { CONTROL_NATIVES, failSyntax, startReduce } from "./control.mjs";
import { giveNew } from "./series.mjs";

const NANOSECONDS = 1e9;
const WORDS = ["word", "set-word", "get-word", "lit-word", "refinement"];
const LOGIC_WORDS = { true: true, "on": true, yes: true, false: false, off: false, "no": false };

/**
 * @uses readRest (src/store/store.mjs), isList (src/store/store.mjs)
 * @usedby makeFunct
 */
const collectSetWords = (store, block) =>
  // Find the set-words of a block and of its inner blocks.
  readRest(store, block).flatMap((item) => {
    if (item.type === "set-word") return [item];
    return isList(item) ? collectSetWords(store, item) : [];
  });

/**
 * @uses readRest (src/store/store.mjs), makeKey (src/store/store.mjs), collectSetWords,
 *   makeSeries (src/store/store.mjs), makeWord (src/machine/machine.mjs), CONTROL_NATIVES
 * @usedby WORD_NATIVES
 */
const makeFunct = (machine, [spec, body]) => {
  // Each word that the body sets is a local word of the function.
  const known = readRest(machine.store, spec).map((item) => makeKey(String(item.value)));
  const locals = collectSetWords(machine.store, body).filter((word) => !known.includes(makeKey(word.value)));
  const made = makeSeries(machine.store, "block", locals.map((word) => makeWord(word.value)));
  return CONTROL_NATIVES.function({ ...machine, store: made.store }, [spec, made.value, body]);
};

/**
 * @uses isTrue (src/machine/machine.mjs), NONE (src/store/store.mjs), callFunction (src/machine/call.mjs),
 *   startReduce, readRest (src/store/store.mjs)
 * @usedby WORD_NATIVES
 */
const applyFunction = (machine, [callee, block], options) => {
  // The block gives the arguments in the sequence of the specification. A refinement takes a logic value.
  const finish = (reduced, values) => {
    const params = callee.value.params;
    const takeGroup = (state, refinement) => {
      const used = isTrue(values[state.place] ?? NONE);
      const args = refinement.params.map((param, place) => values[state.place + 1 + place] ?? NONE);
      const next = { ...state, place: state.place + 1 + refinement.params.length };
      return used ? { ...next, names: [...state.names, refinement.key], extra: [...state.extra, ...args] } : next;
    };
    const taken = callee.value.refinements.reduce(takeGroup, { place: params.length, names: [], extra: [] });
    const args = [...params.map((param, place) => values[place] ?? NONE), ...taken.extra];
    return callFunction(reduced, callee, { names: taken.names, args, label: "apply" });
  };
  // With /only, the items of the block are the arguments, without an evaluation.
  return options.$only === undefined ? startReduce(machine, block, finish) : finish(machine, readRest(machine.store, block));
};

/**
 * @uses isList (src/store/store.mjs), readRest (src/store/store.mjs), WORDS, giveNew
 * @usedby WORD_NATIVES
 */
const collectWords = (machine, [block], options) => {
  // The result has each word one time. With /set, only the set-words are collected, and they stay set-words. With /deep, the inner blocks are read also.
  // REBOL 2.7.8 has a defect here: it gives only the first word. WebRebol does not copy the defect.
  const ignored = (options.$ignore === undefined || !isList(options.$ignore[0]) ? [] : readRest(machine.store, options.$ignore[0])).map((word) => String(word.value).toLowerCase());
  const isWanted = (item) => (options.$set === undefined ? WORDS.includes(item.type) : item.type === "set-word");
  const listWords = (items) => items.flatMap((item) => (item.type === "block" && options.$deep !== undefined ? listWords(readRest(machine.store, item)) : [item]).filter((inner) => isWanted(inner)));
  const found = listWords(readRest(machine.store, block)).map((word) => (options.$set === undefined ? { ...word, type: "word" } : word));
  const isFirst = (word, place) => found.findIndex((other) => other.value.toLowerCase() === word.value.toLowerCase()) === place;
  return giveNew(machine, "block", found.filter(isFirst).filter((word) => !ignored.includes(word.value.toLowerCase())));
};

/**
 * @uses NANOSECONDS, askEdge (src/machine/machine.mjs), giveValue (src/machine/machine.mjs),
 *   NONE (src/store/store.mjs)
 * @usedby WORD_NATIVES
 */
const waitForTime = (machine, [value]) => {
  // The edge waits for the time. A number is a number of seconds. Other values do not wait.
  const seconds = { integer: value.value, decimal: value.value, time: value.value / NANOSECONDS }[value.type] ?? 0;
  return askEdge(machine, { kind: "wait", milliseconds: Math.max(seconds * 1000, 0), resume: (waiting) => giveValue(waiting, NONE) });
};

/**
 * @uses readWord (src/store/store.mjs), giveValue (src/machine/machine.mjs), writeWord (src/store/store.mjs)
 * @usedby WORD_NATIVES
 */
const setDefault = (machine, [word, value]) => {
  const old = readWord(machine.store, word);
  const absent = old.type === "unset" || old.type === "none";
  return absent ? giveValue({ ...machine, store: writeWord(machine.store, word, value) }, value) : giveValue(machine, old);
};

/**
 * @uses readRest (src/store/store.mjs), WORDS
 * @usedby REFLECTORS
 */
const readSpecWords = (store, callee) => readRest(store, callee.value.spec).filter((item) => WORDS.includes(item.type));

/**
 * @uses readContext (src/store/store.mjs), makeDatum (src/data/datum.mjs), makeKey (src/store/store.mjs)
 * @usedby REFLECTORS
 */
const makeBody = (store, object) => {
  // The body of an object is a block of set-words and values.
  const values = readContext(store, object.value.context);
  return object.value.words.flatMap((word) => [makeDatum("set-word", word), values[makeKey(word)]]);
};

/**
 * @uses makeWord (src/machine/machine.mjs), readSpecWords, readContext (src/store/store.mjs),
 *   makeKey (src/store/store.mjs), readRest (src/store/store.mjs), makeBody
 * @usedby reflectOn, reflectValue
 */
const REFLECTORS = {
  words: (store, value) => (value.type === "object" ? value.value.words.map(makeWord) : readSpecWords(store, value)),
  values: (store, value) => value.value.words.map((word) => readContext(store, value.value.context)[makeKey(word)]),
  spec: (store, value) => readRest(store, value.value.spec),
  body: (store, value) => (value.type === "object" ? makeBody(store, value) : readRest(store, value.value.body)),
};

/**
 * @usedby reflectOn
 */
const canReflect = (value, field) =>
  value.type === "object" || (value.type === "function" && value.value.spec !== undefined && field !== "values");

/**
 * @uses canReflect, giveNew, REFLECTORS, failMachine (src/machine/machine.mjs)
 * @usedby WORD_NATIVES
 */
const reflectOn = (field) => (machine, [value]) =>
  canReflect(value, field) ? giveNew(machine, "block", REFLECTORS[field](machine.store, value)) : failMachine(machine, "script invalid-arg", [value]);

/**
 * @uses REFLECTORS, failMachine (src/machine/machine.mjs), giveNew
 * @usedby WORD_NATIVES
 */
const reflectValue = (machine, [value, field]) => {
  const reflector = REFLECTORS[String(field.value).toLowerCase()];
  return reflector === undefined ? failMachine(machine, "script invalid-arg", [field]) : giveNew(machine, "block", reflector(machine.store, value));
};

/**
 * @uses GLOBAL (src/store/store.mjs), readContext (src/store/store.mjs), giveValue (src/machine/machine.mjs),
 *   NONE (src/store/store.mjs)
 * @usedby WORD_NATIVES
 */
const findOwner = (machine, [word]) => {
  // The owner of a word is the object of its context. The global context has no object in WebRebol.
  const owner = word.bind === GLOBAL ? undefined : readContext(machine.store, word.bind)?.$self;
  return giveValue(machine, owner ?? NONE);
};

/**
 * @uses NONE (src/store/store.mjs), LOGIC_WORDS, makeLogic (src/machine/machine.mjs)
 * @usedby constructObject
 */
const readLiteral = (item) => {
  // In a construct block, the words for true, false and none give their values. Other words stay words.
  if (item.type !== "word") return item;
  const name = item.value.toLowerCase();
  if (name === "none") return NONE;
  return LOGIC_WORDS[name] === undefined ? item : makeLogic(LOGIC_WORDS[name]);
};

/**
 * @uses readRest (src/store/store.mjs), readLiteral, NONE (src/store/store.mjs), makeRecord (src/store/store.mjs),
 *   giveValue (src/machine/machine.mjs)
 * @usedby WORD_NATIVES
 */
const constructObject = (machine, [block]) => {
  // The block is not evaluated. Each set-word gets the value after it.
  const items = readRest(machine.store, block);
  const places = items.map((item, place) => place).filter((place) => items[place].type === "set-word");
  const words = places.map((place) => items[place].value);
  const values = places.map((place) => readLiteral(items[place + 1] ?? NONE));
  const made = makeRecord(machine.store, words, values);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses failMachine (src/machine/machine.mjs), isList (src/store/store.mjs), readRest (src/store/store.mjs)
 * @usedby WORD_NATIVES
 */
const causeError = (machine, [type, id, args]) =>
  failMachine(machine, `${type.value} ${id.value}`, isList(args) ? readRest(machine.store, args) : [args]);

/**
 * @uses isTrue (src/machine/machine.mjs), giveValue (src/machine/machine.mjs), popFrame (src/machine/machine.mjs),
 *   makeLogic (src/machine/machine.mjs), makeSeries (src/store/store.mjs), moldValue (src/store/mold.mjs),
 *   failMachine (src/machine/machine.mjs), startBlock (src/machine/machine.mjs), pushFrame (src/machine/machine.mjs)
 * @usedby WORD_NATIVES
 */
const assertBlock = (machine, [block]) => {
  // The block must give a true value. If not, the error shows the block.
  const check = (current) => {
    if (isTrue(current.value)) return giveValue(popFrame(current), makeLogic(true));
    const made = makeSeries(current.store, "string", `assertion failed for: ${moldValue(current.store, block)}`);
    return failMachine({ ...popFrame(current), store: made.store }, "user message", [made.value]);
  };
  return startBlock(pushFrame(machine, { step: check }), block);
};

/**
 * @uses loadSource (src/data/load.mjs), readRest (src/store/store.mjs), failSyntax, allocate (src/store/store.mjs),
 *   giveValue (src/machine/machine.mjs)
 * @usedby WORD_NATIVES
 */
const loadText = (machine, [source], options) => {
  // One value gives the value itself. More values, or /all, give a block.
  const loaded = loadSource(readRest(machine.store, source));
  if (loaded.type === "error") return failSyntax(machine, loaded);
  const made = allocate(machine.store, loaded);
  const items = readRest(made.store, made.value);
  const single = items.length === 1 && options.$all === undefined;
  return giveValue({ ...machine, store: made.store }, single ? items[0] : made.value);
};

/**
 * @uses throwValue (src/machine/machine.mjs), makeDatum (src/data/datum.mjs)
 * @usedby WORD_NATIVES
 */
const stopMachine = (machine) => throwValue(machine, "quit", makeDatum("unset", null));

/**
 * The natives for functions, words and objects that are not basic. Each entry has the name of REBOL and the function.
 * @uses makeFunct, applyFunction, collectWords, waitForTime, failMachine (src/machine/machine.mjs), setDefault,
 *   reflectOn, reflectValue, findOwner, constructObject, causeError, assertBlock, loadText,
 *   giveValue (src/machine/machine.mjs), stopMachine
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const WORD_NATIVES = {
  funct: makeFunct,
  apply: applyFunction,
  "collect-words": collectWords,
  wait: waitForTime,
  "else": (machine) => failMachine(machine, "script else-gone"),
  default: setDefault,
  "words-of": reflectOn("words"),
  "values-of": reflectOn("values"),
  "spec-of": reflectOn("spec"),
  "body-of": reflectOn("body"),
  reflect: reflectValue,
  "bind?": findOwner,
  "bound?": findOwner,
  construct: constructObject,
  "cause-error": causeError,
  assert: assertBlock,
  load: loadText,
  // TODO: A protected word can change in WebRebol.
  protect: (machine, [word]) => giveValue(machine, word),
  unprotect: (machine, [word]) => giveValue(machine, word),
  quit: stopMachine,
  halt: stopMachine,
};
