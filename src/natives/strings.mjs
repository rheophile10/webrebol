import { readAll, readRest, writeAll } from "../store/store.mjs";
import { giveValue } from "../machine/machine.mjs";
import { readPart } from "./edit.mjs";

const TRIMMERS = {
  $all: (text) => text.replace(/\s+/g, ""),
  $head: (text) => text.replace(/^\s+/, ""),
  $tail: (text) => text.replace(/\s+$/, ""),
  $lines: (text) => text.replace(/\s+/g, " ").trim(),
};

/**
 * @uses readAll (src/store/store.mjs), giveValue (src/machine/machine.mjs), writeAll (src/store/store.mjs)
 * @usedby trimText, changeCase
 */
const writeRest = (machine, series, text) => {
  // The characters before the position do not change.
  const head = readAll(machine.store, series).slice(0, series.value.index);
  return giveValue({ ...machine, store: writeAll(machine.store, series, head + text) }, series);
};

/**
 * @uses TRIMMERS, writeRest, readRest (src/store/store.mjs)
 * @usedby STRING_NATIVES
 */
const trimText = (machine, [series], options) => {
  // Without a refinement, the spaces at the head and at the tail are removed.
  const name = Object.keys(TRIMMERS).find((key) => options[key] !== undefined);
  const trim = name === undefined ? (text) => text.trim() : TRIMMERS[name];
  return writeRest(machine, series, trim(readRest(machine.store, series)));
};

/**
 * @uses readRest (src/store/store.mjs), readPart, writeRest
 * @usedby STRING_NATIVES
 */
const changeCase = (change) => (machine, [series], options) => {
  // With /part, only the first characters change.
  const rest = readRest(machine.store, series);
  const size = options.$part === undefined ? rest.length : Math.max(readPart(series, options.$part[0]), 0);
  return writeRest(machine, series, change(rest.slice(0, size)) + rest.slice(size));
};

/**
 * The natives that change the characters of a text. Each entry has the name of REBOL and the function.
 * @uses trimText, changeCase
 * @usedby NATIVES
 */
export const STRING_NATIVES = {
  trim: trimText,
  uppercase: changeCase((text) => text.toUpperCase()),
  lowercase: changeCase((text) => text.toLowerCase()),
};
