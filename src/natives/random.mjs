import { makeDatum } from "../data/datum.mjs";
import { NONE, UNSET, isList, isSeries, readRest } from "../store/store.mjs";
import { formValue } from "../store/mold.mjs";
import { failMachine, giveValue, makeLogic } from "../machine/machine.mjs";
import { giveNew, pickItem } from "./series.mjs";

const NANOSECONDS = 1e9;

/**
 * Gives the next number of the generator of random numbers, and the next state of the generator.
 * @param {number} seed - The state of the generator.
 * @returns {{ seed: number, value: number }}
 * @standard range - The value is 0 or more, and less than 1.
 * @keypoint The generator is not the generator of REBOL. The same seed gives different numbers in REBOL.
 * @usedby drawChances
 */
export const nextRandom = (seed) => {
  // The mulberry32 generator.
  const next = (seed + 0x6d2b79f5) | 0;
  const mixed = Math.imul(next ^ (next >>> 15), next | 1);
  const again = mixed ^ (mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61));
  return { seed: next, value: ((again ^ (again >>> 14)) >>> 0) / 4294967296 };
};

/**
 * @usedby PICKERS
 */
const pickWhole = (limit, chance) => {
  // A positive limit gives 1 to the limit. A negative limit gives the limit to -1. Zero gives zero.
  const size = Math.abs(Math.trunc(limit));
  return Math.sign(limit) * (size === 0 ? 0 : 1 + Math.floor(chance * size));
};

/**
 * @uses makeDatum (src/data/datum.mjs), pickWhole, makeLogic (src/machine/machine.mjs), NANOSECONDS
 * @usedby pickRandom
 */
const PICKERS = {
  integer: (value, chances) => makeDatum("integer", pickWhole(value.value, chances[0])),
  decimal: (value, chances) => makeDatum("decimal", value.value * chances[0]),
  char: (value, chances) => makeDatum("char", pickWhole(value.value, chances[0])),
  logic: (value, chances) => makeLogic(chances[0] < 0.5),
  time: (value, chances) => makeDatum("time", pickWhole(value.value / NANOSECONDS, chances[0]) * NANOSECONDS),
  money: (value, chances) => makeDatum("money", { ...value.value, amount: value.value.amount * chances[0] }),
  pair: (value, chances) => makeDatum("pair", value.value.map((part, place) => pickWhole(part, chances[place]))),
  tuple: (value, chances) => makeDatum("tuple", value.value.map((part, place) => Math.floor(chances[place] * (part + 1)))),
};

/**
 * @uses nextRandom
 * @usedby pickSeries, pickRandom
 */
const drawChances = (seed, count) => {
  // Take a number of values from the generator. Give the values and the last state.
  const draw = (state) => {
    const next = nextRandom(state.seed);
    return { seed: next.seed, chances: [...state.chances, next.value] };
  };
  return Array.from({ length: count }).reduce(draw, { seed, chances: [] });
};

/**
 * @usedby pickSeries
 */
const shuffle = (items, chances) => {
  // Each position changes places with a random position that is not after it.
  const swap = (list, chance, place) => {
    const other = Math.floor(chance * (place + 1));
    const moved = { [place]: list[other], [other]: list[place] };
    return list.map((item, index) => moved[index] ?? item);
  };
  return chances.reduce(swap, items);
};

/**
 * @usedby pickRandom
 */
const hashSeed = (text) => [...text].reduce((sum, char) => (Math.imul(sum, 31) + char.charCodeAt(0)) | 0, 7);

/**
 * @uses readRest (src/store/store.mjs), drawChances, giveValue (src/machine/machine.mjs), pickItem,
 *   NONE (src/store/store.mjs), shuffle, giveNew, isList (src/store/store.mjs)
 * @usedby pickRandom
 */
const pickSeries = (machine, series, options) => {
  // With /only, the result is one random item. Without it, the result has the items in a random sequence.
  const items = readRest(machine.store, series);
  const drawn = drawChances(machine.store.seed, items.length);
  const seeded = { ...machine, store: { ...machine.store, seed: drawn.seed } };
  if (options.$only !== undefined) return giveValue(seeded, pickItem(machine.store, series, Math.floor(drawn.chances[0] * items.length)) ?? NONE);
  // The result is a new series. The first series does not change.
  const mixed = shuffle([...items], drawn.chances);
  return giveNew(seeded, series.type, isList(series) || series.type === "binary" ? mixed : mixed.join(""));
};

/**
 * @uses giveValue (src/machine/machine.mjs), hashSeed, formValue (src/store/mold.mjs), UNSET (src/store/store.mjs),
 *   isSeries (src/store/store.mjs), pickSeries, PICKERS, failMachine (src/machine/machine.mjs), drawChances
 * @usedby RANDOM_NATIVES
 */
const pickRandom = (machine, [value], options) => {
  // With /seed, the value starts the generator again.
  if (options.$seed !== undefined) {
    return giveValue({ ...machine, store: { ...machine.store, seed: hashSeed(formValue(machine.store, value)) } }, UNSET);
  }
  if (isSeries(value)) return pickSeries(machine, value, options);
  const picker = PICKERS[value.type];
  if (picker === undefined) return failMachine(machine, "script invalid-arg", [value]);
  const drawn = drawChances(machine.store.seed, 10);
  return giveValue({ ...machine, store: { ...machine.store, seed: drawn.seed } }, picker(value, drawn.chances));
};

/**
 * The random native. The entry has the name of REBOL and the function.
 * @uses pickRandom
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const RANDOM_NATIVES = {
  random: pickRandom,
};
