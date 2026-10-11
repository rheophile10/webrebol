/** @import { Datum, Machine } from "../types/states.mjs" */
import { loadSource } from "../data/load.mjs";
import { makeDatum } from "../data/datum.mjs";
import { NONE, UNSET, allocate, bindCopy, isList, makeContext, makeSeries, readRest } from "../store/store.mjs";
import { atEnd, failMachine, giveValue, isTrue, popFrame, pushFrame, replaceTop, startBlock, stopThrown, throwValue } from "../machine/machine.mjs";
import { parseSpec } from "../machine/spec.mjs";

/**
 * @uses startBlock (src/machine/machine.mjs), pushFrame (src/machine/machine.mjs),
 *   popFrame (src/machine/machine.mjs), stopThrown (src/machine/machine.mjs)
 * @usedby CONTROL_NATIVES
 */
const tryBlock = (machine, [block]) =>
  startBlock(pushFrame(machine, { step: popFrame, unwind: stopThrown("error"), cursor: machine.cursor }), block);

/**
 * @uses isList (src/store/store.mjs), readRest (src/store/store.mjs)
 * @usedby makeFunction
 */
const readSpecItem = (store) => (item) => (isList(item) ? { type: "block", value: readRest(store, item).map((name) => String(name.value)) } : item);

/**
 * @uses parseSpec (src/machine/spec.mjs), readRest (src/store/store.mjs), readSpecItem,
 *   makeContext (src/store/store.mjs), bindCopy (src/store/store.mjs), makeDatum (src/data/datum.mjs),
 *   giveValue (src/machine/machine.mjs)
 * @usedby makeWithLocals, makeDoes, CONTROL_NATIVES
 */
const makeFunction = (machine, [spec, body]) => {
  // The function gets a context for its words. The body is a copy that uses this context.
  const parsed = parseSpec(readRest(machine.store, spec).map(readSpecItem(machine.store)));
  const made = makeContext(machine.store, {});
  const bound = bindCopy(made.store, body, { id: made.id, keys: parsed.keys });
  const callee = makeDatum("function", { ...parsed, context: made.id, body: bound.value, spec });
  return giveValue({ ...machine, store: bound.store }, callee);
};

/**
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby makeWithLocals
 */
const LOCAL = makeDatum("refinement", "local");

/**
 * @uses readRest (src/store/store.mjs), LOCAL, makeSeries (src/store/store.mjs), makeFunction
 * @usedby makeHas, CONTROL_NATIVES
 */
const makeWithLocals = (machine, [spec, locals, body]) => {
  // The local words go after a /local refinement in a new specification.
  const items = [...readRest(machine.store, spec), LOCAL, ...readRest(machine.store, locals)];
  const made = makeSeries(machine.store, "block", items);
  return makeFunction({ ...machine, store: made.store }, [made.value, body]);
};

/**
 * @uses makeSeries (src/store/store.mjs), makeWithLocals
 * @usedby CONTROL_NATIVES
 */
const makeHas = (machine, [locals, body]) => {
  const empty = makeSeries(machine.store, "block", []);
  return makeWithLocals({ ...machine, store: empty.store }, [empty.value, locals, body]);
};

/**
 * @uses makeSeries (src/store/store.mjs), makeFunction
 * @usedby CONTROL_NATIVES
 */
const makeDoes = (machine, [body]) => {
  const empty = makeSeries(machine.store, "block", []);
  return makeFunction({ ...machine, store: empty.store }, [empty.value, body]);
};

/**
 * @uses loadSource (src/data/load.mjs), readRest (src/store/store.mjs), failMachine (src/machine/machine.mjs),
 *   allocate (src/store/store.mjs), startBlock (src/machine/machine.mjs)
 * @usedby doValue
 */
/**
 * Starts the error that the loader found. The texts of the error go into the store.
 * @param {Machine} machine
 * @param {Datum} fault - The error datum of the loader.
 * @returns {Machine}
 * @standard fields - The texts of the loader are the fields arg1 and arg2 of the error.
 * @uses makeSeries (src/store/store.mjs), failMachine (src/machine/machine.mjs)
 * @usedby doText, toBlock, interpretSource, loadText
 */
export const failSyntax = (machine, fault) => {
  const addText = (made, text) => {
    const next = makeSeries(made.store, "string", text);
    return { store: next.store, values: [...made.values, next.value] };
  };
  const made = (fault.args ?? []).reduce(addText, { store: machine.store, values: [] });
  return failMachine({ ...machine, store: made.store }, fault.value, made.values);
};

/**
 * @uses loadSource (src/data/load.mjs), readRest (src/store/store.mjs), failSyntax, allocate (src/store/store.mjs),
 *   startBlock (src/machine/machine.mjs)
 * @usedby doValue
 */
const doText = (machine, text) => {
  // Load the text. A text that is not valid REBOL gives the error of the loader.
  const loaded = loadSource(readRest(machine.store, text));
  if (loaded.type === "error") return failSyntax(machine, loaded);
  const made = allocate(machine.store, loaded);
  return startBlock({ ...machine, store: made.store }, made.value);
};

/**
 * @uses startBlock (src/machine/machine.mjs), doText, giveValue (src/machine/machine.mjs)
 * @usedby CONTROL_NATIVES
 */
const doValue = (machine, [value]) => {
  if (value.type === "block" || value.type === "paren") return startBlock(machine, value);
  return value.type === "string" ? doText(machine, value) : giveValue(machine, value);
};

/**
 * @uses atEnd (src/machine/machine.mjs), popFrame (src/machine/machine.mjs)
 * @usedby stepReduce, startReduce
 */
const continueReduce = (machine) => {
  // At the end of the block, the owner gets the values.
  const frame = machine.frames.top;
  if (!atEnd(machine)) return { ...machine, mode: "next" };
  return frame.finish({ ...popFrame(machine), cursor: frame.cursor }, frame.values);
};

/**
 * @uses continueReduce, replaceTop (src/machine/machine.mjs)
 * @usedby startReduce
 */
const stepReduce = (machine, frame) =>
  continueReduce(replaceTop(machine, { ...frame, values: [...frame.values, machine.value] }));

/**
 * Starts the evaluation of each expression of a block. A function gets the list of the results.
 * @param {Machine} machine
 * @param {Datum} block
 * @param {Function} finish - The function that gets the machine and the results, and gives the next machine.
 * @returns {Machine}
 * @standard sequence - The results are in the sequence of the expressions.
 * @uses stepReduce, continueReduce, pushFrame (src/machine/machine.mjs)
 * @usedby 9 declarations in control, items, text, words
 */
export const startReduce = (machine, block, finish) => {
  const frame = { step: stepReduce, values: [], cursor: machine.cursor, finish };
  return continueReduce({ ...pushFrame(machine, frame), cursor: { ...block.value } });
};

/**
 * @uses makeSeries (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby reduceValue
 */
const giveBlock = (machine, values) => {
  const made = makeSeries(machine.store, "block", values);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses startReduce, giveBlock, giveValue (src/machine/machine.mjs)
 * @usedby CONTROL_NATIVES
 */
const reduceValue = (machine, [value]) =>
  value.type === "block" ? startReduce(machine, value, giveBlock) : giveValue(machine, value);

/**
 * @uses isTrue (src/machine/machine.mjs), startBlock (src/machine/machine.mjs), giveValue (src/machine/machine.mjs),
 *   NONE (src/store/store.mjs)
 * @usedby CONTROL_NATIVES
 */
const chooseBlock = (wanted) => (machine, [condition, block]) =>
  isTrue(condition) === wanted ? startBlock(machine, block) : giveValue(machine, NONE);

/**
 * The natives for control of the evaluation. Each entry has the name of REBOL and the function.
 * @uses chooseBlock, startBlock (src/machine/machine.mjs), isTrue (src/machine/machine.mjs),
 *   throwValue (src/machine/machine.mjs), UNSET (src/store/store.mjs), makeFunction, makeDoes, makeHas,
 *   makeWithLocals, doValue, reduceValue, tryBlock
 * @usedby NATIVES, makeFunct, WORD_NATIVES
 */
export const CONTROL_NATIVES = {
  "if": chooseBlock(true),
  unless: chooseBlock(false),
  either: (machine, [condition, yes, other]) => startBlock(machine, isTrue(condition) ? yes : other),
  return: (machine, [value]) => throwValue(machine, "return", value),
  exit: (machine) => throwValue(machine, "return", UNSET),
  func: makeFunction,
  does: makeDoes,
  has: makeHas,
  function: makeWithLocals,
  "do": doValue,
  reduce: reduceValue,
  try: tryBlock,
};
