/** @import { Datum, Store } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { isList, isText, readRest } from "../store/store.mjs";
import { failMachine, giveValue, isTrue, makeLogic } from "../machine/machine.mjs";

const TOLERANCE = 2.3e-15;
const ANY_PAIR = "value1 value2";
const NUMBERS = ["integer", "decimal"];
const WORDS = ["word", "set-word", "get-word", "lit-word", "refinement"];
const ORDERED = ["char", "time"];
/**
 * The names of the REBOL types that WebRebol has.
 */
export const TYPES = [
  ...["integer", "decimal", "string", "char", "word", "set-word", "get-word", "lit-word", "refinement", "block"],
  ...["paren", "path", "set-path", "lit-path", "issue", "file", "email", "url", "tag", "tuple", "pair", "time"],
  ...["binary", "logic", "none", "error", "unset", "datatype", "native", "op", "function", "object"],
];

/**
 * @uses TOLERANCE
 * @usedby areEqual
 */
const isNear = (left, right) => Math.abs(left - right) <= TOLERANCE * Math.max(Math.abs(left), Math.abs(right));

/**
 * @uses NUMBERS, isNear, isText (src/store/store.mjs), readRest (src/store/store.mjs), WORDS,
 *   isList (src/store/store.mjs), areSameLists
 * @usedby areSameLists, equate
 */
/**
 * Finds if two values are equal, as the `=` operator of REBOL does.
 * @param {Store} store
 * @param {Datum} left
 * @param {Datum} right
 * @returns {boolean}
 * @standard case - Two texts or two words are equal without regard to the case of the letters.
 * @uses NUMBERS, isNear, isText (src/store/store.mjs), readRest (src/store/store.mjs), WORDS,
 *   isList (src/store/store.mjs), areSameLists
 * @usedby areSameLists, equate, switchValue, startsWith
 */
export const areEqual = (store, left, right) => {
  // Numbers of the two number types can be equal. REBOL ignores a very small difference.
  if (NUMBERS.includes(left.type) && NUMBERS.includes(right.type)) return isNear(left.value, right.value);
  if (left.type !== right.type) return false;
  // Texts and words are equal without regard to the case of the letters.
  if (isText(left)) return readRest(store, left).toLowerCase() === readRest(store, right).toLowerCase();
  if (WORDS.includes(left.type)) return left.value.toLowerCase() === right.value.toLowerCase();
  if (isList(left)) return areSameLists(store, readRest(store, left), readRest(store, right));
  return left.type === "object" ? left.value.context === right.value.context : String(left.value) === String(right.value);
};

/**
 * @uses areEqual
 * @usedby areEqual
 */
const areSameLists = (store, left, right) =>
  left.length === right.length && left.every((item, place) => areEqual(store, item, right[place]));

/**
 * @uses NUMBERS, isText (src/store/store.mjs), readRest (src/store/store.mjs), ORDERED
 * @usedby compare
 */
const readOrder = (store, value) => {
  // Give the data that the order uses, or null for a type without an order.
  if (NUMBERS.includes(value.type)) return { group: "number", data: value.value };
  if (isText(value)) return { group: value.type, data: readRest(store, value).toLowerCase() };
  return ORDERED.includes(value.type) ? { group: value.type, data: value.value } : null;
};

/**
 * @uses readOrder, failMachine (src/machine/machine.mjs), giveValue (src/machine/machine.mjs),
 *   makeLogic (src/machine/machine.mjs)
 * @usedby COMPARE_NATIVES
 */
const compare = (test) => (machine, [left, right]) => {
  // The two values must have the same type of order.
  const first = readOrder(machine.store, left);
  const second = readOrder(machine.store, right);
  if (first === null || second === null || first.group !== second.group) return failMachine(machine, "script expect-set");
  return giveValue(machine, makeLogic(test(first.data, second.data)));
};

/**
 * @uses giveValue (src/machine/machine.mjs), makeLogic (src/machine/machine.mjs), areEqual
 * @usedby COMPARE_NATIVES
 */
const equate = (wanted) => (machine, [left, right]) =>
  giveValue(machine, makeLogic(areEqual(machine.store, left, right) === wanted));

/**
 * @uses giveValue (src/machine/machine.mjs), makeLogic (src/machine/machine.mjs)
 * @usedby PREDICATES
 */
const testType = (type) => (machine, [value]) => giveValue(machine, makeLogic(value.type === type));

/**
 * @uses TYPES, testType
 * @usedby COMPARE_NATIVES
 */
const PREDICATES = Object.fromEntries(TYPES.map((type) => [`${type}?`, ["value [any-type!]", testType(type)]]));

/**
 * The natives that compare values and that examine types. Each entry has the specification and the function.
 * @uses PREDICATES, ANY_PAIR, equate, compare, giveValue (src/machine/machine.mjs),
 *   makeLogic (src/machine/machine.mjs), isTrue (src/machine/machine.mjs), makeDatum (src/data/datum.mjs)
 * @usedby NATIVES
 */
export const COMPARE_NATIVES = {
  ...PREDICATES,
  "equal?": [ANY_PAIR, equate(true)],
  "not-equal?": [ANY_PAIR, equate(false)],
  "lesser?": [ANY_PAIR, compare((left, right) => left < right)],
  "greater?": [ANY_PAIR, compare((left, right) => left > right)],
  "lesser-or-equal?": [ANY_PAIR, compare((left, right) => left <= right)],
  "greater-or-equal?": [ANY_PAIR, compare((left, right) => left >= right)],
  not: ["value", (machine, [value]) => giveValue(machine, makeLogic(!isTrue(value)))],
  "type?": ["value [any-type!]", (machine, [value]) => giveValue(machine, makeDatum("datatype", value.type))],
};
