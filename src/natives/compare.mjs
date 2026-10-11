/** @import { Datum, Store } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { isList, isText, readRest } from "../store/store.mjs";
import { failMachine, giveValue, isTrue, makeLogic } from "../machine/machine.mjs";
import { TYPESETS } from "../machine/spec.mjs";

const TOLERANCE = 2.3e-15;
const NUMBERS = ["integer", "decimal"];
const WORDS = ["word", "set-word", "get-word", "lit-word", "refinement"];
const ORDERED = ["char", "time"];
const RECORDS = ["money", "date"];
const DAY = 86400e9;
/**
 * The names of the REBOL types that WebRebol has.
 */
export const TYPES = [
  ...["integer", "decimal", "string", "char", "word", "set-word", "get-word", "lit-word", "refinement", "block"],
  ...["paren", "path", "set-path", "lit-path", "issue", "file", "email", "url", "tag", "tuple", "pair", "time"],
  ...["binary", "logic", "none", "error", "unset", "datatype", "native", "op", "function", "object", "bitset", "money", "date", "action"],
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
 *   isList (src/store/store.mjs), areSameLists, RECORDS
 * @usedby areSame, areSameLists, COMPARE_NATIVES, switchValue, matchesItem, makeSearch, makeUnique, combine
 */
export const areEqual = (store, left, right) => {
  // Numbers of the two number types can be equal. REBOL ignores a very small difference.
  if (NUMBERS.includes(left.type) && NUMBERS.includes(right.type)) return isNear(left.value, right.value);
  // A char is equal to the integer of its code.
  if ([left.type, right.type].sort().join() === "char,integer") return left.value === right.value;
  if (left.type !== right.type) return false;
  // Texts and words are equal without regard to the case of the letters.
  if (isText(left)) return readRest(store, left).toLowerCase() === readRest(store, right).toLowerCase();
  if (WORDS.includes(left.type)) return left.value.toLowerCase() === right.value.toLowerCase();
  if (isList(left)) return areSameLists(store, readRest(store, left), readRest(store, right));
  if (RECORDS.includes(left.type)) return JSON.stringify(left.value) === JSON.stringify(right.value);
  return left.type === "object" ? left.value.context === right.value.context : String(left.value) === String(right.value);
};

/**
 * @uses areEqual
 * @usedby areEqual
 */
/**
 * Finds if two values are equal and also have the same type and the same case, as `==` of REBOL does.
 * @param {Store} store
 * @param {Datum} left
 * @param {Datum} right
 * @returns {boolean}
 * @standard strict - Two texts with different case are not equal.
 * @uses isText (src/store/store.mjs), readRest (src/store/store.mjs), WORDS, isList (src/store/store.mjs), areEqual
 * @usedby areIdentical, COMPARE_NATIVES, makeSearch
 */
export const areSame = (store, left, right) => {
  if (left.type !== right.type) return false;
  if (isText(left)) return readRest(store, left) === readRest(store, right);
  if (WORDS.includes(left.type)) return left.value === right.value;
  if (!isList(left)) return areEqual(store, left, right);
  const others = readRest(store, right);
  const items = readRest(store, left);
  return items.length === others.length && items.every((item, place) => areSame(store, item, others[place]));
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
/**
 * Gets the data that gives the order of a value.
 * @param {Store} store
 * @param {Datum} value
 * @returns {{ group: string, data: number | string } | null}
 * @standard none - A type without an order gives null.
 * @uses NUMBERS, isText (src/store/store.mjs), readRest (src/store/store.mjs), DAY, ORDERED
 * @usedby compare, choose, findExtreme, compareItems
 */
export const readOrder = (store, value) => {
  // Give the data that the order uses, or null for a type without an order.
  if (NUMBERS.includes(value.type)) return { group: "number", data: value.value };
  if (isText(value)) return { group: value.type, data: readRest(store, value).toLowerCase() };
  if (value.type === "money") return { group: `money ${value.value.code}`, data: value.value.amount };
  if (value.type === "tuple") return { group: "tuple", data: value.value.map((byte) => String.fromCharCode(byte)).join("") };
  // The order of two dates uses the time of the world, without the time zone.
  if (value.type === "date") return { group: "date", data: value.value.days * DAY + (value.value.time ?? 0) - value.value.zone };
  return ORDERED.includes(value.type) ? { group: value.type, data: value.value } : null;
};

/**
 * @uses readOrder, failMachine (src/machine/machine.mjs), makeDatum (src/data/datum.mjs),
 *   giveValue (src/machine/machine.mjs), makeLogic (src/machine/machine.mjs)
 * @usedby COMPARE_NATIVES
 */
const compare = (test) => (machine, [left, right]) => {
  // The two values must have the same type of order.
  const first = readOrder(machine.store, left);
  const second = readOrder(machine.store, right);
  if (first === null || second === null || first.group !== second.group) {
    return failMachine(machine, "script expect-set", [left, right].map((value) => makeDatum("datatype", value.type)));
  }
  return giveValue(machine, makeLogic(test(first.data, second.data)));
};

/**
 * @uses giveValue (src/machine/machine.mjs), makeLogic (src/machine/machine.mjs)
 * @usedby COMPARE_NATIVES
 */
const equate = (test, wanted) => (machine, [left, right]) =>
  giveValue(machine, makeLogic(test(machine.store, left, right) === wanted));

/**
 * @usedby areIdentical
 */
const isSeriesValue = (value) => typeof value.value === "object" && value.value !== null && value.value.id !== undefined;

/**
 * @uses isSeriesValue, areSame
 * @usedby COMPARE_NATIVES
 */
const areIdentical = (store, left, right) => {
  // Two series are the same if they are one series at one position.
  if (!isSeriesValue(left) || !isSeriesValue(right)) return areSame(store, left, right);
  return left.type === right.type && left.value.id === right.value.id && left.value.index === right.value.index;
};

/**
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby choose
 */
const choosePairs = (wanted, left, right) =>
  makeDatum("pair", left.value.map((part, place) => (wanted ? Math.min : Math.max)(part, right.value[place])));

/**
 * @uses giveValue (src/machine/machine.mjs), choosePairs, readOrder, failMachine (src/machine/machine.mjs),
 *   makeDatum (src/data/datum.mjs)
 * @usedby COMPARE_NATIVES
 */
const choose = (wanted) => (machine, [left, right]) => {
  if (left.type === "pair" && right.type === "pair") return giveValue(machine, choosePairs(wanted, left, right));
  // Give the first value if the order agrees with the wanted order.
  const first = readOrder(machine.store, left);
  const second = readOrder(machine.store, right);
  if (first === null || second === null || first.group !== second.group) {
    return failMachine(machine, "script expect-set", [left, right].map((value) => makeDatum("datatype", value.type)));
  }
  return giveValue(machine, first.data < second.data === wanted ? left : right);
};

/**
 * @uses giveValue (src/machine/machine.mjs), makeLogic (src/machine/machine.mjs)
 * @usedby PREDICATES
 */
const testType = (type) => (machine, [value]) => giveValue(machine, makeLogic(value.type === type));

const ABSENT_TYPES = ["routine", "struct", "library", "port", "event", "image", "hash", "list", "map", "typeset", "closure", "get-path"];

/**
 * @uses giveValue (src/machine/machine.mjs), makeLogic (src/machine/machine.mjs), TYPESETS (src/machine/spec.mjs)
 * @usedby PREDICATES
 */
const testTypeset = (name) => (machine, [value]) =>
  giveValue(machine, makeLogic(name === "any-type!" || TYPESETS[name].includes(value.type)));

/**
 * @uses TYPES, testType, ABSENT_TYPES, TYPESETS (src/machine/spec.mjs), testTypeset
 * @usedby COMPARE_NATIVES
 */
const PREDICATES = Object.fromEntries([
  ...TYPES.map((type) => [`${type}?`, testType(type)]),
  ...ABSENT_TYPES.map((type) => [`${type}?`, testType(type)]),
  ...[...Object.keys(TYPESETS), "any-type!"].map((name) => [`${name.slice(0, -1)}?`, testTypeset(name)]),
]);

/**
 * The natives that compare values and that examine types. Each entry has the name of REBOL and the function.
 * @uses PREDICATES, equate, areEqual, areSame, areIdentical, choose, compare, giveValue (src/machine/machine.mjs),
 *   makeLogic (src/machine/machine.mjs), isTrue (src/machine/machine.mjs), makeDatum (src/data/datum.mjs)
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const COMPARE_NATIVES = {
  ...PREDICATES,
  "equal?": equate(areEqual, true),
  "not-equal?": equate(areEqual, false),
  "strict-equal?": equate(areSame, true),
  "strict-not-equal?": equate(areSame, false),
  "same?": equate(areIdentical, true),
  min: choose(true),
  minimum: choose(true),
  max: choose(false),
  maximum: choose(false),
  "lesser?": compare((left, right) => left < right),
  "greater?": compare((left, right) => left > right),
  "lesser-or-equal?": compare((left, right) => left <= right),
  "greater-or-equal?": compare((left, right) => left >= right),
  not: (machine, [value]) => giveValue(machine, makeLogic(!isTrue(value))),
  "type?": (machine, [value]) => giveValue(machine, makeDatum("datatype", value.type)),
};
