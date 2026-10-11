/** @import { Datum } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { makeDate } from "../data/dates.mjs";

const NANOSECONDS = 1e9;
const NUMBERS = ["integer", "decimal"];

/**
 * @uses NUMBERS
 * @usedby combineChar, combineTime, combinePair, combineTuple, combineMoney
 */
const isNumber = (value) => NUMBERS.includes(value.type);

/**
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby combineMoney
 */
const makeType = (type) => makeDatum("datatype", type);

/**
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby combineChar
 */
const makeChar = (number) => makeDatum("char", ((Math.trunc(number) % 256) + 256) % 256);

/**
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby combineTime
 */
const makeWhole = (number) => makeDatum(Number.isInteger(number) ? "integer" : "decimal", number);

/**
 * @uses isNumber, makeDatum (src/data/datum.mjs), makeChar
 * @usedby COMBINERS
 */
const combineChar = (call, left, right) => {
  // The difference of two chars is an integer. Other results are a char.
  if (!isNumber(right) && right.type !== "char") return null;
  if (call.name === "subtract" && right.type === "char") return makeDatum("integer", left.value - right.value);
  return makeChar(call.operation(left.value, Math.trunc(right.value)));
};

/**
 * @uses isNumber, makeDatum (src/data/datum.mjs), NANOSECONDS, makeWhole
 * @usedby combineNumber, COMBINERS
 */
const combineTime = (call, left, right) => {
  // A number with a time is a number of seconds, but for a multiplication or a division it is a factor.
  const scaled = ["multiply", "divide"].includes(call.name);
  if (isNumber(right)) return makeDatum("time", Math.round(call.operation(left.value, scaled ? right.value : right.value * NANOSECONDS)));
  if (right.type !== "time" || call.name === "multiply") return null;
  // A time divided by a time is a number.
  const result = call.operation(left.value, right.value);
  return call.name === "divide" ? makeWhole(result) : makeDatum("time", result);
};

/**
 * @usedby combineTuple
 */
const spread = (value, size) => (Array.isArray(value.value) ? value.value : Array.from({ length: size }).map(() => Math.trunc(value.value)));

/**
 * @uses isNumber, makeDatum (src/data/datum.mjs)
 * @usedby combineNumber, COMBINERS
 */
const combinePair = (call, left, right) => {
  if (right.type !== "pair" && !isNumber(right)) return null;
  const other = right.type === "pair" ? right.value : [right.value, right.value];
  return makeDatum("pair", left.value.map((part, place) => Math.trunc(call.operation(part, other[place]))));
};

/**
 * @uses isNumber, spread, makeDatum (src/data/datum.mjs)
 * @usedby combineNumber, COMBINERS
 */
const combineTuple = (call, left, right) => {
  // A shorter tuple has zeros at its end. Each part stays between 0 and 255.
  if (right.type !== "tuple" && !isNumber(right)) return null;
  const size = Math.max(left.value.length, right.type === "tuple" ? right.value.length : 0);
  const others = spread(right, size);
  const clamp = (number) => Math.min(Math.max(Math.trunc(number), 0), 255);
  const combinePart = (unused, place) =>
    clamp(call.operation(left.value[place] ?? 0, others[place] ?? (right.type === "tuple" && call.name === "multiply" ? 1 : 0)));
  return makeDatum("tuple", Array.from({ length: size }).map(combinePart));
};

/**
 * @uses makeDatum (src/data/datum.mjs), isNumber, makeType
 * @usedby combineNumber, COMBINERS
 */
const combineMoney = (call, left, right) => {
  // Two money values must have the same currency. Their quotient is a number.
  const makeMoney = (amount) => makeDatum("money", { code: left.value.code, amount });
  if (isNumber(right)) return makeMoney(call.operation(left.value.amount, right.value));
  if (right.type !== "money") return null;
  if (left.value.code !== right.value.code) return { error: "script wrong-denom", args: [left, right] };
  if (call.name === "multiply") return { error: "script expect-set", args: [makeType("number"), makeType("money")] };
  const result = call.operation(left.value.amount, right.value.amount);
  return call.name === "divide" ? makeDatum("decimal", result) : makeMoney(result);
};

/**
 * @uses makeDatum (src/data/datum.mjs), makeDate (src/data/dates.mjs)
 * @usedby COMBINERS
 */
const combineDate = (call, left, right) => {
  // A number is a number of days. A time needs a date that has a time. Two dates give their difference in days.
  const sign = call.name === "subtract" ? -1 : 1;
  if (!["add", "subtract"].includes(call.name)) return null;
  if (right.type === "integer") return makeDatum("date", { ...left.value, days: left.value.days + sign * right.value });
  if (right.type === "date" && sign < 0) return makeDatum("integer", left.value.days - right.value.days);
  if (right.type !== "time" || left.value.time === null) return null;
  return makeDatum("date", makeDate(left.value.days, left.value.time + sign * right.value, left.value.zone));
};

/**
 * @uses makeDatum (src/data/datum.mjs), combineTime, combinePair, combineTuple, combineMoney
 * @usedby COMBINERS
 */
const combineNumber = (call, left, right) => {
  // A number at the left of a value of a different type. An integer with a char gives an integer.
  if (right.type === "char") return makeDatum("integer", Math.trunc(call.operation(left.value, right.value)));
  if (!["add", "multiply"].includes(call.name)) return null;
  const combine = { time: combineTime, pair: combinePair, tuple: combineTuple, money: combineMoney }[right.type];
  return combine === undefined ? null : combine(call, right, left);
};

/**
 * @uses combineChar, combineTime, combinePair, combineTuple, combineMoney, combineDate, combineNumber
 * @usedby combineScalars
 */
const COMBINERS = {
  char: combineChar,
  time: combineTime,
  pair: combinePair,
  tuple: combineTuple,
  money: combineMoney,
  date: combineDate,
  integer: combineNumber,
  decimal: combineNumber,
};

/**
 * Does arithmetic for two values when one of them is not a number: a char, a time, a pair, a tuple, a money or a date.
 * @param {{ name: string, operation: Function }} call - The name of the REBOL function and its operation for numbers.
 * @param {Datum} left
 * @param {Datum} right
 * @returns {Datum | { error: string, args: Datum[] } | null}
 * @standard none - Two types that do not go together give null.
 * @uses COMBINERS
 * @usedby giveScalar
 */
export const combineScalars = (call, left, right) => COMBINERS[left.type]?.(call, left, right) ?? null;

/**
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby changeScalar
 */
const CHANGERS = {
  time: (value, change) => makeDatum("time", change(value.value)),
  pair: (value, change) => makeDatum("pair", value.value.map(change)),
  money: (value, change) => makeDatum("money", { ...value.value, amount: change(value.value.amount) }),
};

/**
 * Applies an operation of one number to a time, a pair or a money value.
 * @param {Datum} value
 * @param {Function} change - The operation for one number.
 * @returns {Datum | null}
 * @standard none - A type without such an operation gives null.
 * @uses CHANGERS
 * @usedby change, roundNumber
 */
export const changeScalar = (value, change) => CHANGERS[value.type]?.(value, change) ?? null;

/**
 * Gets the numbers that a value holds.
 * @param {Datum} value
 * @returns {number[]}
 * @usedby isZero, testNumber
 */
export const readNumbers = (value) => {
  if (Array.isArray(value.value)) return value.value;
  return [value.type === "money" ? value.value.amount : value.value];
};
