/** @import { Store } from "../types/states.mjs" */
import { loadSource } from "../data/load.mjs";
import { makeDatum } from "../data/datum.mjs";
import { EMPTY_STORE, GLOBAL, NONE, makeKey, writeContext } from "../store/store.mjs";
import { makeLogic } from "../machine/machine.mjs";
import { parseSpec } from "../machine/spec.mjs";
import { MATH_NATIVES } from "./math.mjs";
import { COMPARE_NATIVES, TYPES } from "./compare.mjs";
import { CONTROL_NATIVES } from "./control.mjs";
import { SERIES_NATIVES, guardSeries } from "./series.mjs";
import { TEXT_NATIVES } from "./text.mjs";
import { LOOP_NATIVES } from "./loops.mjs";
import { FLOW_NATIVES } from "./flow.mjs";
import { OBJECT_NATIVES } from "./objects.mjs";
import { CONVERT_NATIVES } from "./convert.mjs";
import { SPECS } from "./specs.mjs";
import { EDIT_NATIVES } from "./edit.mjs";
import { SEARCH_NATIVES } from "./search.mjs";
import { STRING_NATIVES } from "./strings.mjs";
import { NUMBER_NATIVES } from "./numbers.mjs";
import { FAULT_NATIVES } from "./faults.mjs";
import { BITSET_NATIVES, findInBitset } from "./bitsets.mjs";
import { PARSE_NATIVES } from "./parse.mjs";
import { ITEM_NATIVES } from "./items.mjs";
import { WORD_NATIVES } from "./words.mjs";
import { ENCODE_NATIVES } from "./encode.mjs";

/**
 * @uses MATH_NATIVES, COMPARE_NATIVES, CONTROL_NATIVES, LOOP_NATIVES, FLOW_NATIVES, OBJECT_NATIVES, SERIES_NATIVES,
 *   TEXT_NATIVES, CONVERT_NATIVES, guardSeries, EDIT_NATIVES, SEARCH_NATIVES, STRING_NATIVES, NUMBER_NATIVES,
 *   FAULT_NATIVES, BITSET_NATIVES, PARSE_NATIVES, ITEM_NATIVES, WORD_NATIVES, ENCODE_NATIVES
 * @usedby findAny, makeFunction, GLOBALS
 */
const NATIVES = {
  ...MATH_NATIVES,
  ...COMPARE_NATIVES,
  ...CONTROL_NATIVES,
  ...LOOP_NATIVES,
  ...FLOW_NATIVES,
  ...OBJECT_NATIVES,
  ...SERIES_NATIVES,
  ...TEXT_NATIVES,
  ...CONVERT_NATIVES,
  ...guardSeries({ ...EDIT_NATIVES, ...SEARCH_NATIVES, ...STRING_NATIVES }),
  ...NUMBER_NATIVES,
  ...FAULT_NATIVES,
  ...BITSET_NATIVES,
  ...PARSE_NATIVES,
  ...ITEM_NATIVES,
  ...WORD_NATIVES,
  ...ENCODE_NATIVES,
  "q": WORD_NATIVES.quit,
};

const TYPESETS = ["number", "series", "any-block", "any-string", "any-word", "any-function", "any-type", "scalar"];

/**
 * @uses findInBitset, NATIVES
 * @usedby makeFunction
 */
const findAny = (machine, args, options) =>
  // A bitset is not a series, but `find` accepts it.
  args[0].type === "bitset" ? findInBitset(machine, args) : NATIVES.find(machine, args, options);

const OPERATORS = {
  "+": "add",
  "-": "subtract",
  "*": "multiply",
  "/": "divide",
  "//": "remainder",
  "=": "equal?",
  "<>": "not-equal?",
  "<": "lesser?",
  ">": "greater?",
  "<=": "lesser-or-equal?",
  ">=": "greater-or-equal?",
  "==": "strict-equal?",
  "!==": "strict-not-equal?",
  "!=": "not-equal?",
  "=?": "same?",
  "**": "power",
  and: "and~",
  "or": "or~",
  xor: "xor~",
};

/**
 * @uses makeLogic (src/machine/machine.mjs), NONE (src/store/store.mjs)
 * @usedby GLOBALS
 */
const CONSTANTS = { true: makeLogic(true), false: makeLogic(false), none: NONE };

/**
 * @usedby makeFunction
 */
const readSpecItem = (item) => (item.type === "block" ? { ...item, value: item.value.map((name) => name.value) } : item);

/**
 * @uses parseSpec (src/machine/spec.mjs), loadSource (src/data/load.mjs), SPECS, readSpecItem,
 *   makeDatum (src/data/datum.mjs), findAny, NATIVES
 * @usedby GLOBALS
 */
const makeFunction = (type, name, sign) => {
  // The parameters come from REBOL, as text. The loader reads them.
  const spec = parseSpec(loadSource(SPECS[sign][1]).value.map(readSpecItem));
  // REBOL has three types for its own functions. The type comes from REBOL.
  return makeDatum(type ?? SPECS[sign][0], { ...spec, native: name === "find" ? findAny : NATIVES[name] });
};

/**
 * @uses NATIVES, makeKey (src/store/store.mjs), makeFunction, OPERATORS, CONSTANTS, TYPES, TYPESETS,
 *   makeDatum (src/data/datum.mjs)
 * @usedby START_STORE
 */
const GLOBALS = Object.fromEntries([
  ...Object.keys(NATIVES).map((name) => [makeKey(name), makeFunction(null, name, name)]),
  ...Object.entries(OPERATORS).map(([sign, name]) => [makeKey(sign), makeFunction("op", name, sign)]),
  ...Object.entries(CONSTANTS).map(([name, value]) => [makeKey(name), value]),
  ...[...TYPES, ...TYPESETS].map((type) => [makeKey(`${type}!`), makeDatum("datatype", type)]),
]);

/**
 * The store at the start of a session. Its global context has the natives, the operators and the constants.
 * @type {Store}
 * @uses writeContext (src/store/store.mjs), EMPTY_STORE (src/store/store.mjs), GLOBAL (src/store/store.mjs), GLOBALS
 * @usedby EMPTY_BLOCK, interpretSource, makeReady (test/machine.test.mjs), readGlobal (test/machine.test.mjs)
 */
export const START_STORE = writeContext(EMPTY_STORE, GLOBAL, GLOBALS);
