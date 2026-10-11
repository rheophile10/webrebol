import { loadSource } from "../data/load.mjs";
import { makeDatum } from "../data/datum.mjs";
import { countDays, makeDate } from "../data/dates.mjs";
import { GLOBAL, allocate, isList, isText, makeSeries, readRest } from "../store/store.mjs";
import { formValue } from "../store/mold.mjs";
import { failMachine, giveValue } from "../machine/machine.mjs";
import { failSyntax } from "./control.mjs";

const NUMBERS = ["integer", "decimal"];
const NANOSECONDS = 1e9;

/**
 * @uses makeSeries (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby toString, toBlock
 */
const giveSeries = (machine, type, content) => {
  const made = makeSeries(machine.store, type, content);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses isList (src/store/store.mjs), readRest (src/store/store.mjs), giveSeries, formValue (src/store/mold.mjs)
 * @usedby CONVERT_NATIVES
 */
const toString = (machine, [value]) => {
  // The items of a block are formed and joined, without spaces.
  const parts = isList(value) ? readRest(machine.store, value) : [value];
  return giveSeries(machine, "string", parts.map((part) => formValue(machine.store, part)).join(""));
};

/**
 * @uses NUMBERS, NANOSECONDS, isText (src/store/store.mjs), readRest (src/store/store.mjs)
 * @usedby toNumber
 */
const readNumber = (store, value) => {
  // Give null if the value does not show a number. A char gives its code. A time gives its seconds.
  if (NUMBERS.includes(value.type) || value.type === "char") return value.value;
  if (value.type === "time") return value.value / NANOSECONDS;
  const text = isText(value) ? readRest(store, value).trim() : "";
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text) ? Number(text) : null;
};

/**
 * @uses readNumber, failMachine (src/machine/machine.mjs), giveValue (src/machine/machine.mjs),
 *   makeDatum (src/data/datum.mjs)
 * @usedby CONVERT_NATIVES
 */
const toNumber = (type, change) => (machine, [value]) => {
  const number = readNumber(machine.store, value);
  return number === null ? failMachine(machine, "script invalid-arg", [value]) : giveValue(machine, makeDatum(type, change(number)));
};

/**
 * @uses isList (src/store/store.mjs), giveSeries, readRest (src/store/store.mjs), loadSource (src/data/load.mjs),
 *   failSyntax, allocate (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby CONVERT_NATIVES
 */
const toBlock = (machine, [value]) => {
  // A string is loaded. A list gives a block with the same items. Other values become the one item.
  if (isList(value)) return giveSeries(machine, "block", readRest(machine.store, value));
  if (value.type !== "string") return giveSeries(machine, "block", [value]);
  const loaded = loadSource(readRest(machine.store, value));
  if (loaded.type === "error") return failSyntax(machine, loaded);
  const made = allocate(machine.store, loaded);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses isText (src/store/store.mjs), readRest (src/store/store.mjs), giveValue (src/machine/machine.mjs),
 *   GLOBAL (src/store/store.mjs)
 * @usedby CONVERT_NATIVES
 */
const toWord = (machine, [value]) => {
  const name = isText(value) ? readRest(machine.store, value) : String(value.value);
  return giveValue(machine, { type: "word", value: name, bind: value.bind ?? GLOBAL });
};

/**
 * @uses readRest (src/store/store.mjs)
 * @usedby BUILDERS
 */
const readNumbers = (store, block) => readRest(store, block).map((item) => item.value);

/**
 * @uses makeDatum (src/data/datum.mjs), makeDate (src/data/dates.mjs), countDays (src/data/dates.mjs)
 * @usedby BUILDERS
 */
const makeDateFrom = (numbers) => {
  // The year is first if the first number is too large for a day.
  const [year, month, day] = numbers[0] > 31 ? numbers : [numbers[2], numbers[1], numbers[0]];
  return makeDatum("date", makeDate(countDays(year, month, day), null, 0));
};

/**
 * @uses NUMBERS, makeDatum (src/data/datum.mjs), NANOSECONDS, isList (src/store/store.mjs), readNumbers, makeDateFrom
 * @usedby toScalar
 */
const BUILDERS = {
  char: (store, value) => (NUMBERS.includes(value.type) ? makeDatum("char", value.value) : null),
  time: (store, value) => {
    if (NUMBERS.includes(value.type)) return makeDatum("time", Math.round(value.value * NANOSECONDS));
    const [hours = 0, minutes = 0, seconds = 0] = isList(value) ? readNumbers(store, value) : [NaN];
    return makeDatum("time", Math.round((hours * 3600 + minutes * 60 + seconds) * NANOSECONDS));
  },
  pair: (store, value) => (isList(value) ? makeDatum("pair", readNumbers(store, value).slice(0, 2)) : null),
  tuple: (store, value) => (isList(value) ? makeDatum("tuple", readNumbers(store, value)) : null),
  money: (store, value) => {
    if (NUMBERS.includes(value.type)) return makeDatum("money", { code: "", amount: value.value });
    const [code, amount] = isList(value) ? readNumbers(store, value) : [];
    return amount === undefined ? null : makeDatum("money", { code: String(code).toUpperCase(), amount });
  },
  date: (store, value) => (isList(value) ? makeDateFrom(readNumbers(store, value)) : null),
};

/**
 * @uses readRest (src/store/store.mjs), makeDatum (src/data/datum.mjs), loadSource (src/data/load.mjs)
 * @usedby toScalar
 */
const readLoaded = (store, value, type) => {
  // A text gives the value that the loader reads from it. A char is the first character of a text.
  const text = readRest(store, value);
  if (type === "char") return text.length > 0 ? makeDatum("char", text.charCodeAt(0)) : null;
  const loaded = loadSource(type === "money" && !text.includes("$") ? `$${text}` : text);
  const first = loaded.type === "error" ? undefined : loaded.value[0];
  return first !== undefined && first.type === type ? first : null;
};

/**
 * @uses giveValue (src/machine/machine.mjs), isText (src/store/store.mjs), readLoaded, BUILDERS, readFirst,
 *   failMachine (src/machine/machine.mjs)
 * @usedby CONVERT_NATIVES
 */
const toScalar = (type) => (machine, [value]) => {
  if (value.type === type) return giveValue(machine, value);
  const made = isText(value) ? readLoaded(machine.store, value, type) : BUILDERS[type](machine.store, value);
  const valid = made !== null && !Number.isNaN(readFirst(made));
  return valid ? giveValue(machine, made) : failMachine(machine, "script invalid-arg", [value]);
};

/**
 * @usedby toScalar
 */
const readFirst = (value) => (typeof value.value === "number" ? value.value : 0);

/**
 * The natives that make a value of a different type. Each entry has the name of REBOL and the function.
 * @uses toString, toNumber, toBlock, toWord, toScalar, giveValue (src/machine/machine.mjs),
 *   makeDatum (src/data/datum.mjs)
 * @usedby NATIVES, MAKERS, makeValue
 */
export const CONVERT_NATIVES = {
  "to-string": toString,
  "to-integer": toNumber("integer", Math.trunc),
  "to-decimal": toNumber("decimal", (number) => number),
  "to-block": toBlock,
  "to-word": toWord,
  "to-char": toScalar("char"),
  "to-time": toScalar("time"),
  "to-pair": toScalar("pair"),
  "to-tuple": toScalar("tuple"),
  "to-money": toScalar("money"),
  "to-date": toScalar("date"),
  "as-pair": (machine, [first, second]) => giveValue(machine, makeDatum("pair", [Math.trunc(first.value), Math.trunc(second.value)])),
};
