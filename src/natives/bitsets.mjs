/** @import { Datum, Machine } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { NONE, isText, readRest } from "../store/store.mjs";
import { failMachine, giveValue, makeLogic } from "../machine/machine.mjs";

const BYTES = 32;

/**
 * @usedby makeBitset, addItem, makeCharset
 */
const countUp = (size) => Array.from({ length: Math.max(size, 0) });

/**
 * Finds if a bitset has a character.
 * @param {Datum} bitset
 * @param {number} code - The code of the character.
 * @returns {boolean}
 * @standard limit - A code that is larger than the count of the bits is not in a bitset.
 * @usedby findInBitset, matchInText, makeBitSearch
 */
export const hasBit = (bitset, code) => code >= 0 && code < bitset.value.length * 8 && ((bitset.value[code >> 3] >> (code & 7)) & 1) === 1;

/**
 * @uses countUp, makeDatum (src/data/datum.mjs), BYTES
 * @usedby makeCharset
 */
const makeBitset = (codes) => {
  // Each character has one bit. The low bit of a byte is the first character of the byte.
  const makeByte = (item, place) =>
    countUp(8).reduce((byte, bit, shift) => (codes.includes(place * 8 + shift) ? byte | (1 << shift) : byte), 0);
  return makeDatum("bitset", countUp(BYTES).map(makeByte));
};

/**
 * @uses isText (src/store/store.mjs), readRest (src/store/store.mjs), countUp
 * @usedby makeCharset
 */
const addItem = (store) => (state, item) => {
  // A "-" between two chars gives all the chars from the first to the second.
  if (item.type === "word") return { ...state, range: item.value === "-" };
  if (isText(item)) return { ...state, codes: [...state.codes, ...[...readRest(store, item)].map((char) => char.charCodeAt(0))] };
  const from = state.range ? state.last : item.value;
  const added = countUp(item.value - from + 1).map((unused, offset) => from + offset);
  return { codes: [...state.codes, ...added], last: item.value, range: false };
};

/**
 * @uses giveValue (src/machine/machine.mjs), makeDatum (src/data/datum.mjs), readRest (src/store/store.mjs), countUp,
 *   failMachine (src/machine/machine.mjs), makeBitset, isText (src/store/store.mjs), addItem
 * @usedby BITSET_NATIVES
 */
const makeCharset = (machine, [spec]) => {
  // A binary gives its bytes as the bits. A number gives an empty bitset. A text or a block gives its characters.
  if (spec.type === "bitset") return giveValue(machine, spec);
  if (spec.type === "binary") {
    return giveValue(machine, makeDatum("bitset", readRest(machine.store, spec)));
  }
  // A number is the count of the bits. It must be a multiple of 8.
  if (spec.type === "integer") {
    const valid = spec.value >= 0 && spec.value % 8 === 0;
    return valid ? giveValue(machine, makeDatum("bitset", countUp(spec.value / 8).map(() => 0))) : failMachine(machine, "script invalid-arg", [spec]);
  }
  if (spec.type === "char") return giveValue(machine, makeBitset([spec.value]));
  const items = isText(spec) ? [spec] : readRest(machine.store, spec);
  return giveValue(machine, makeBitset(items.reduce(addItem(machine.store), { codes: [], last: 0, range: false }).codes));
};

/**
 * Makes the bitset that has all the characters that a bitset does not have.
 * @param {Datum} bitset
 * @returns {Datum}
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby complementValue
 */
export const complementBitset = (bitset) => makeDatum("bitset", bitset.value.map((byte) => ~byte & 255));

/**
 * Gives true if a bitset has a char, and none if it does not, as `find` of REBOL does.
 * @param {Machine} machine
 * @param {Datum[]} pair - The bitset and the char.
 * @returns {Machine}
 * @uses giveValue (src/machine/machine.mjs), hasBit, makeLogic (src/machine/machine.mjs), NONE (src/store/store.mjs)
 * @usedby findAny (src/session/globals.mjs)
 */
export const findInBitset = (machine, [bitset, char]) =>
  giveValue(machine, hasBit(bitset, char.value) ? makeLogic(true) : NONE);

/**
 * The natives for bitsets. Each entry has the name of REBOL and the function.
 * @uses makeCharset
 * @usedby convertValue, NATIVES (src/session/globals.mjs)
 */
export const BITSET_NATIVES = {
  charset: makeCharset,
  "to-bitset": makeCharset,
};
