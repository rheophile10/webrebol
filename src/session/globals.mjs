/** @import { Store } from "../types/states.mjs" */
import { loadSource } from "../data/load.mjs";
import { makeDatum } from "../data/datum.mjs";
import { EMPTY_STORE, NONE, makeKey } from "../store/store.mjs";
import { makeLogic } from "../machine/machine.mjs";
import { parseSpec } from "../machine/spec.mjs";
import { MATH_NATIVES } from "../natives/math.mjs";
import { COMPARE_NATIVES, TYPES } from "../natives/compare.mjs";
import { CONTROL_NATIVES } from "../natives/control.mjs";
import { SERIES_NATIVES, guardSeries } from "../natives/series.mjs";
import { TEXT_NATIVES } from "../natives/text.mjs";
import { LOOP_NATIVES } from "../natives/loops.mjs";
import { FLOW_NATIVES } from "../natives/flow.mjs";
import { OBJECT_NATIVES } from "../natives/objects.mjs";
import { CONVERT_NATIVES } from "../natives/convert.mjs";
import { SPECS } from "../natives/specs.mjs";
import { EDIT_NATIVES } from "../natives/edit.mjs";
import { SEARCH_NATIVES } from "../natives/search.mjs";
import { STRING_NATIVES } from "../natives/strings.mjs";
import { NUMBER_NATIVES } from "../natives/numbers.mjs";
import { FAULT_NATIVES } from "../natives/faults.mjs";
import { BITSET_NATIVES, findInBitset } from "../natives/bitsets.mjs";
import { PARSE_NATIVES } from "../natives/parse.mjs";
import { ITEM_NATIVES } from "../natives/items.mjs";
import { WORD_NATIVES } from "../natives/words.mjs";
import { ENCODE_NATIVES } from "../natives/encode.mjs";
import { DIGEST_NATIVES } from "../natives/digest.mjs";
import { CLOCK_NATIVES } from "../natives/clock.mjs";
import { FILE_NATIVES, doFile, loadFile } from "../natives/files.mjs";
import { RANDOM_NATIVES } from "../natives/random.mjs";
import { COLORS, VIEW_SPECS } from "../view/data.mjs";
import { VIEW_NATIVES } from "../view/layout.mjs";
import { WEB_NATIVES, WEB_SPECS } from "../view/elements.mjs";
import { WINDOW_NATIVES } from "../view/windows.mjs";
import { GRID_NATIVES, GRID_SPECS } from "../view/grid.mjs";
import { VIEW_BOOT } from "../view/boot.mjs";
import { allocate } from "../store/store.mjs";
import { makeMachine } from "../machine/machine.mjs";
import { runMachine } from "../machine/run.mjs";

/**
 * @uses MATH_NATIVES (src/natives/math.mjs), COMPARE_NATIVES (src/natives/compare.mjs),
 *   CONTROL_NATIVES (src/natives/control.mjs), LOOP_NATIVES (src/natives/loops.mjs),
 *   FLOW_NATIVES (src/natives/flow.mjs), OBJECT_NATIVES (src/natives/objects.mjs),
 *   SERIES_NATIVES (src/natives/series.mjs), TEXT_NATIVES (src/natives/text.mjs),
 *   CONVERT_NATIVES (src/natives/convert.mjs), guardSeries (src/natives/series.mjs),
 *   EDIT_NATIVES (src/natives/edit.mjs), SEARCH_NATIVES (src/natives/search.mjs),
 *   STRING_NATIVES (src/natives/strings.mjs), NUMBER_NATIVES (src/natives/numbers.mjs),
 *   FAULT_NATIVES (src/natives/faults.mjs), BITSET_NATIVES (src/natives/bitsets.mjs),
 *   PARSE_NATIVES (src/natives/parse.mjs), ITEM_NATIVES (src/natives/items.mjs),
 *   WORD_NATIVES (src/natives/words.mjs), ENCODE_NATIVES (src/natives/encode.mjs),
 *   DIGEST_NATIVES (src/natives/digest.mjs), CLOCK_NATIVES (src/natives/clock.mjs),
 *   FILE_NATIVES (src/natives/files.mjs), RANDOM_NATIVES (src/natives/random.mjs),
 *   VIEW_NATIVES (src/view/layout.mjs), WEB_NATIVES (src/view/elements.mjs), WINDOW_NATIVES (src/view/windows.mjs),
 *   GRID_NATIVES (src/view/grid.mjs)
 * @usedby OVERRIDES, findAny, makeFunction, GLOBALS
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
  ...DIGEST_NATIVES,
  ...CLOCK_NATIVES,
  ...FILE_NATIVES,
  ...RANDOM_NATIVES,
  ...VIEW_NATIVES,
  ...WEB_NATIVES,
  ...WINDOW_NATIVES,
  ...GRID_NATIVES,
  "q": WORD_NATIVES.quit,
};

const TYPESETS = ["number", "series", "any-block", "any-string", "any-word", "any-function", "any-type", "scalar"];

/**
 * @uses doFile (src/natives/files.mjs), NATIVES, loadFile (src/natives/files.mjs), findAny
 * @usedby makeFunction
 */
const OVERRIDES = {
  // A file value makes `do` and `load` read the disk.
  "do": (machine, args, options) => (args[0].type === "file" ? doFile(machine, args[0]) : NATIVES["do"](machine, args, options)),
  load: (machine, args, options) => (args[0].type === "file" ? loadFile(machine, args[0]) : NATIVES.load(machine, args, options)),
  find: (machine, args, options) => findAny(machine, args, options),
};

/**
 * @uses findInBitset (src/natives/bitsets.mjs), NATIVES
 * @usedby OVERRIDES
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
 * @uses makeLogic (src/machine/machine.mjs), NONE (src/store/store.mjs), makeDatum (src/data/datum.mjs)
 * @usedby GLOBALS
 */
const CONSTANTS = { true: makeLogic(true), false: makeLogic(false), none: NONE, "pi": makeDatum("decimal", Math.PI) };

/**
 * @usedby makeFunction
 */
const readSpecItem = (item) => (item.type === "block" ? { ...item, value: item.value.map((name) => name.value) } : item);

/**
 * @uses SPECS (src/natives/specs.mjs), VIEW_SPECS (src/view/data.mjs), WEB_SPECS (src/view/elements.mjs),
 *   GRID_SPECS (src/view/grid.mjs), parseSpec (src/machine/spec.mjs), loadSource (src/data/load.mjs), readSpecItem,
 *   makeDatum (src/data/datum.mjs), OVERRIDES, NATIVES
 * @usedby GLOBALS
 */
const makeFunction = (type, name, sign) => {
  // The parameters come from REBOL, as text. The loader reads them.
  const facts = SPECS[sign] ?? VIEW_SPECS[sign] ?? WEB_SPECS[sign] ?? GRID_SPECS[sign];
  const spec = parseSpec(loadSource(facts[1]).value.map(readSpecItem));
  // REBOL has three types for its own functions. The type comes from REBOL.
  return makeDatum(type ?? facts[0], { ...spec, native: OVERRIDES[name] ?? NATIVES[name] });
};

/**
 * @uses NATIVES, makeKey (src/store/store.mjs), makeFunction, OPERATORS, CONSTANTS, COLORS (src/view/data.mjs),
 *   makeDatum (src/data/datum.mjs), TYPES (src/natives/compare.mjs), TYPESETS
 * @usedby START_STORE
 */
const GLOBALS = Object.fromEntries([
  ...Object.keys(NATIVES).map((name) => [makeKey(name), makeFunction(null, name, name)]),
  ...Object.entries(OPERATORS).map(([sign, name]) => [makeKey(sign), makeFunction("op", name, sign)]),
  ...Object.entries(CONSTANTS).map(([name, value]) => [makeKey(name), value]),
  ...Object.entries(COLORS).map(([name, parts]) => [makeKey(name), makeDatum("tuple", parts)]),
  ...[...TYPES, ...TYPESETS].map((type) => [makeKey(`${type}!`), makeDatum("datatype", type)]),
]);

/**
 * The store at the start of a session. Its base has the natives, the operators, the constants and the datatypes.
 * @type {Store}
 */
const BOOT_BUDGET = 5000;

/**
 * @uses allocate (src/store/store.mjs), loadSource (src/data/load.mjs), VIEW_BOOT (src/view/boot.mjs),
 *   runMachine (src/machine/run.mjs), makeMachine (src/machine/machine.mjs), BOOT_BUDGET
 * @usedby START_STORE
 */
const bootStore = (store) => {
  // Evaluate the View mezzanines one time. All sessions share the store that this gives.
  const made = allocate(store, loadSource(VIEW_BOOT));
  return runMachine(makeMachine(made.store, made.value), BOOT_BUDGET).store;
};

/**
 * @uses bootStore, EMPTY_STORE (src/store/store.mjs), GLOBALS
 * @usedby runTest (bin/conform.mjs), actual (bin/conform.mjs), EMPTY_BLOCK, startSource,
 *   makeReady (test/machine.test.mjs), readGlobal (test/machine.test.mjs)
 */
export const START_STORE = bootStore({ ...EMPTY_STORE, base: GLOBALS });
