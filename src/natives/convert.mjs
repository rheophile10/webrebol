import { loadSource } from "../data/load.mjs";
import { makeDatum } from "../data/datum.mjs";
import { GLOBAL, allocate, isList, isText, makeSeries, readRest } from "../store/store.mjs";
import { formValue } from "../store/mold.mjs";
import { failMachine, giveValue } from "../machine/machine.mjs";

const NUMBERS = ["integer", "decimal"];

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
 * @uses NUMBERS, isText (src/store/store.mjs), readRest (src/store/store.mjs)
 * @usedby toNumber
 */
const readNumber = (store, value) => {
  // Give null if the value does not show a number.
  if (NUMBERS.includes(value.type)) return value.value;
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
  return number === null ? failMachine(machine, "script invalid-arg") : giveValue(machine, makeDatum(type, change(number)));
};

/**
 * @uses isList (src/store/store.mjs), giveSeries, readRest (src/store/store.mjs), loadSource (src/data/load.mjs),
 *   failMachine (src/machine/machine.mjs), allocate (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby CONVERT_NATIVES
 */
const toBlock = (machine, [value]) => {
  // A string is loaded. A list gives a block with the same items. Other values become the one item.
  if (isList(value)) return giveSeries(machine, "block", readRest(machine.store, value));
  if (value.type !== "string") return giveSeries(machine, "block", [value]);
  const loaded = loadSource(readRest(machine.store, value));
  if (loaded.type === "error") return failMachine(machine, loaded.value);
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
 * The natives that make a value of a different type. Each entry has the specification and the function.
 * @uses toString, toNumber, toBlock, toWord
 * @usedby NATIVES, MAKERS, makeValue
 */
export const CONVERT_NATIVES = {
  "to-string": ["value", toString],
  "to-integer": ["value", toNumber("integer", Math.trunc)],
  "to-decimal": ["value", toNumber("decimal", (number) => number)],
  "to-block": ["value", toBlock],
  "to-word": ["value", toWord],
};
