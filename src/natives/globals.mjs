/** @import { Store } from "../types/states.mjs" */
import { loadSource } from "../data/load.mjs";
import { makeDatum } from "../data/datum.mjs";
import { EMPTY_STORE, GLOBAL, NONE, makeKey, writeContext } from "../store/store.mjs";
import { makeLogic } from "../machine/machine.mjs";
import { parseSpec } from "../machine/spec.mjs";
import { MATH_NATIVES } from "./math.mjs";
import { COMPARE_NATIVES, TYPES } from "./compare.mjs";
import { CONTROL_NATIVES } from "./control.mjs";
import { SERIES_NATIVES } from "./series.mjs";
import { TEXT_NATIVES } from "./text.mjs";
import { LOOP_NATIVES } from "./loops.mjs";
import { FLOW_NATIVES } from "./flow.mjs";
import { OBJECT_NATIVES } from "./objects.mjs";
import { CONVERT_NATIVES } from "./convert.mjs";

/**
 * @uses MATH_NATIVES, COMPARE_NATIVES, CONTROL_NATIVES, LOOP_NATIVES, FLOW_NATIVES, OBJECT_NATIVES, SERIES_NATIVES,
 *   TEXT_NATIVES, CONVERT_NATIVES
 * @usedby makeFunction, GLOBALS
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
};

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
 * @uses NATIVES, makeDatum (src/data/datum.mjs), parseSpec (src/machine/spec.mjs), loadSource (src/data/load.mjs),
 *   readSpecItem
 * @usedby GLOBALS
 */
const makeFunction = (type, name) => {
  // The specification is REBOL text. The loader reads it.
  const [spec, native] = NATIVES[name];
  return makeDatum(type, { ...parseSpec(loadSource(spec).value.map(readSpecItem)), native });
};

/**
 * @uses NATIVES, makeKey (src/store/store.mjs), makeFunction, OPERATORS, CONSTANTS, TYPES,
 *   makeDatum (src/data/datum.mjs)
 * @usedby START_STORE
 */
const GLOBALS = Object.fromEntries([
  ...Object.keys(NATIVES).map((name) => [makeKey(name), makeFunction("native", name)]),
  ...Object.entries(OPERATORS).map(([sign, name]) => [makeKey(sign), makeFunction("op", name)]),
  ...Object.entries(CONSTANTS).map(([name, value]) => [makeKey(name), value]),
  ...TYPES.map((type) => [makeKey(`${type}!`), makeDatum("datatype", type)]),
]);

/**
 * The store at the start of a session. Its global context has the natives, the operators and the constants.
 * @type {Store}
 * @uses writeContext (src/store/store.mjs), EMPTY_STORE (src/store/store.mjs), GLOBAL (src/store/store.mjs), GLOBALS
 * @usedby EMPTY_BLOCK, interpretSource, makeReady (test/machine.test.mjs), readGlobal (test/machine.test.mjs)
 */
export const START_STORE = writeContext(EMPTY_STORE, GLOBAL, GLOBALS);
