import { makeDatum } from "../data/datum.mjs";
import { failMachine, giveValue, makeLogic } from "../machine/machine.mjs";
import { complementBitset } from "./bitsets.mjs";
import { changeScalar, readNumbers } from "./scalars.mjs";

const DEGREES = Math.PI / 180;

/**
 * @uses giveValue (src/machine/machine.mjs), makeDatum (src/data/datum.mjs), failMachine (src/machine/machine.mjs)
 * @usedby calculate, raise, turn, turnBack
 */
const giveDecimal = (machine, result) =>
  Number.isFinite(result) ? giveValue(machine, makeDatum("decimal", result)) : failMachine(machine, "math overflow");

/**
 * @uses giveValue (src/machine/machine.mjs), makeLogic (src/machine/machine.mjs), readNumbers
 * @usedby NUMBER_NATIVES
 */
const testNumber = (test) => (machine, [number]) => giveValue(machine, makeLogic(readNumbers(number).every(test)));

/**
 * @uses giveDecimal
 * @usedby NUMBER_NATIVES
 */
const calculate = (operation) => (machine, [number]) => giveDecimal(machine, operation(number.value));

/**
 * @uses giveDecimal
 * @usedby NUMBER_NATIVES
 */
const raise = (machine, [number, exponent]) =>
  // REBOL gives zero for zero to the power of zero.
  giveDecimal(machine, number.value === 0 ? 0 : Math.pow(number.value, exponent.value));

/**
 * @uses giveDecimal, DEGREES
 * @usedby NUMBER_NATIVES
 */
const turn = (operation) => (machine, [angle], options) =>
  giveDecimal(machine, operation(options.$radians === undefined ? angle.value * DEGREES : angle.value));

/**
 * @uses giveDecimal, DEGREES
 * @usedby NUMBER_NATIVES
 */
const turnBack = (operation) => (machine, [number], options) =>
  giveDecimal(machine, options.$radians === undefined ? operation(number.value) / DEGREES : operation(number.value));

/**
 * @usedby ROUNDERS
 */
const roundEven = (number) => {
  // A number that is exactly between two integers goes to the even integer.
  const low = Math.floor(number);
  if (number - low !== 0.5) return Math.round(number);
  return low % 2 === 0 ? low : low + 1;
};

/**
 * @uses roundEven
 * @usedby roundNumber
 */
const ROUNDERS = {
  $down: Math.trunc,
  $floor: Math.floor,
  $ceiling: Math.ceil,
  $even: roundEven,
};

/**
 * @usedby roundNumber
 */
const roundAway = (number) => Math.sign(number) * Math.floor(Math.abs(number) + 0.5);

/**
 * @uses giveValue (src/machine/machine.mjs), changeScalar, roundAway, makeDatum (src/data/datum.mjs), ROUNDERS
 * @usedby NUMBER_NATIVES
 */
const roundNumber = (machine, [number], options) => {
  if (number.type === "money") return giveValue(machine, changeScalar(number, roundAway));
  // With /to, the result is a multiple of the scale. An integer scale gives an integer.
  const scale = options.$to === undefined ? makeDatum("integer", 1) : options.$to[0];
  const name = Object.keys(ROUNDERS).find((key) => options[key] !== undefined);
  const rounded = (name === undefined ? roundAway : ROUNDERS[name])(number.value / scale.value) * scale.value;
  return giveValue(machine, makeDatum(scale.type === "integer" ? "integer" : "decimal", rounded));
};

/**
 * @uses giveValue (src/machine/machine.mjs), makeLogic (src/machine/machine.mjs),
 *   failMachine (src/machine/machine.mjs), makeDatum (src/data/datum.mjs)
 * @usedby NUMBER_NATIVES
 */
const combineBits = (logic, bits) => (machine, [left, right]) => {
  // Two logic values give a logic value. Two integers give an integer.
  if (left.type === "logic" && right.type === "logic") return giveValue(machine, makeLogic(logic(left.value, right.value)));
  if (left.type !== "integer" || right.type !== "integer") {
    return failMachine(machine, "script expect-set", [left, right].map((value) => makeDatum("datatype", value.type)));
  }
  return giveValue(machine, makeDatum("integer", bits(left.value, right.value)));
};

/**
 * @uses giveValue (src/machine/machine.mjs), complementBitset, makeDatum (src/data/datum.mjs),
 *   makeLogic (src/machine/machine.mjs)
 * @usedby NUMBER_NATIVES
 */
const complementValue = (machine, [value]) => {
  if (value.type === "bitset") return giveValue(machine, complementBitset(value));
  if (value.type === "tuple") return giveValue(machine, makeDatum("tuple", value.value.map((byte) => 255 - byte)));
  return giveValue(machine, value.type === "logic" ? makeLogic(!value.value) : makeDatum("integer", ~value.value));
};

/**
 * @uses giveValue (src/machine/machine.mjs), makeDatum (src/data/datum.mjs)
 * @usedby NUMBER_NATIVES
 */
const shiftBits = (machine, [number, bits], options) =>
  giveValue(machine, makeDatum("integer", options.$left === undefined ? number.value >> bits.value : number.value << bits.value));

/**
 * @uses failMachine (src/machine/machine.mjs), giveValue (src/machine/machine.mjs), makeDatum (src/data/datum.mjs)
 * @usedby NUMBER_NATIVES
 */
const takeModulo = (machine, [left, right]) => {
  // The result has the sign of the divisor.
  if (right.value === 0) return failMachine(machine, "math zero-divide");
  const rest = left.value % right.value;
  const result = rest < 0 ? rest + Math.abs(right.value) : rest;
  return giveValue(machine, makeDatum(left.type === "integer" && right.type === "integer" ? "integer" : "decimal", result));
};

/**
 * The natives for the other functions of numbers. Each entry has the name of REBOL and the function.
 * @uses testNumber, raise, calculate, turn, turnBack, roundNumber, combineBits, complementValue, shiftBits,
 *   takeModulo
 * @usedby NATIVES
 */
export const NUMBER_NATIVES = {
  "zero?": testNumber((number) => number === 0),
  "positive?": testNumber((number) => number > 0),
  "negative?": testNumber((number) => number < 0),
  "even?": testNumber((number) => number % 2 === 0),
  "odd?": testNumber((number) => number % 2 !== 0),
  power: raise,
  "square-root": calculate(Math.sqrt),
  exp: calculate(Math.exp),
  "log-e": calculate(Math.log),
  "log-10": calculate(Math.log10),
  "log-2": calculate(Math.log2),
  sine: turn(Math.sin),
  cosine: turn(Math.cos),
  tangent: turn(Math.tan),
  arcsine: turnBack(Math.asin),
  arccosine: turnBack(Math.acos),
  arctangent: turnBack(Math.atan),
  round: roundNumber,
  "and~": combineBits((left, right) => left && right, (left, right) => left & right),
  "or~": combineBits((left, right) => left || right, (left, right) => left | right),
  "xor~": combineBits((left, right) => left !== right, (left, right) => left ^ right),
  complement: complementValue,
  shift: shiftBits,
  mod: takeModulo,
  modulo: takeModulo,
};
