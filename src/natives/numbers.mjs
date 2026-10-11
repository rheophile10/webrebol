import { makeDatum } from "../data/datum.mjs";
import { failMachine, giveValue, makeLogic } from "../machine/machine.mjs";
import { complementBitset } from "./bitsets.mjs";
import { readNumbers } from "./scalars.mjs";
import { readBytes } from "./digest.mjs";
import { giveNew } from "./series.mjs";

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
 * @uses DEGREES, failMachine (src/machine/machine.mjs), giveDecimal
 * @usedby NUMBER_NATIVES
 */
const turn = (operation) => (machine, [angle], options) => {
  // A result that is almost zero is zero, and a result that is too large is an error, as in REBOL.
  const result = operation(options.$radians === undefined ? angle.value * DEGREES : angle.value);
  if (Math.abs(result) > 1e15) return failMachine(machine, "math overflow");
  return giveDecimal(machine, Math.abs(result) < 1e-15 ? 0 : result);
};

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
  "$half-down": (number) => Math.sign(number) * Math.ceil(Math.abs(number) - 0.5),
  "$half-ceiling": (number) => Math.floor(number + 0.5),
};

const NANOSECONDS = 1e9;

/**
 * @usedby roundNumber
 */
const readAmount = (value) => (value.type === "money" ? value.value.amount : value.value);

/**
 * @usedby roundNumber
 */
const roundAway = (number) => Math.sign(number) * Math.floor(Math.abs(number) + 0.5);

/**
 * @uses NANOSECONDS, readAmount, failMachine (src/machine/machine.mjs), ROUNDERS, roundAway,
 *   giveValue (src/machine/machine.mjs), makeDatum (src/data/datum.mjs)
 * @usedby NUMBER_NATIVES
 */
const roundNumber = (machine, [number], options) => {
  // With /to, the result is a multiple of the scale. A time uses seconds, and a money value uses its amount.
  const unit = number.type === "time" ? NANOSECONDS : 1;
  const scale = options.$to === undefined ? unit : readAmount(options.$to[0]);
  if (scale === 0) return failMachine(machine, "math zero-divide");
  const name = Object.keys(ROUNDERS).find((key) => options[key] !== undefined);
  // The quotient loses its last bits, thus 1.15 / 0.1 is 11.5 and not 11.499999999999998.
  const quotient = Number((readAmount(number) / scale).toPrecision(16));
  const rounded = (name === undefined ? roundAway : ROUNDERS[name])(quotient) * scale;
  if (number.type === "time") return giveValue(machine, makeDatum("time", Math.round(rounded)));
  if (number.type === "money") return giveValue(machine, makeDatum("money", { ...number.value, amount: rounded }));
  const whole = options.$to === undefined || options.$to[0].type === "integer";
  return giveValue(machine, makeDatum(whole ? "integer" : "decimal", rounded));
};

/**
 * @uses failMachine (src/machine/machine.mjs), makeDatum (src/data/datum.mjs)
 * @usedby combineBits
 */
const failTypes = (machine, pair) =>
  failMachine(machine, "script expect-set", pair.map((value) => makeDatum("datatype", value.type)));

/**
 * @uses readBytes, giveNew
 * @usedby combineBits, complementValue
 */
const combineBytes = (machine, pair, bits) => {
  // Two texts or two binaries give a new series. Each byte is the result of the two bytes at the same position.
  const [left, right] = pair.map((value) => readBytes(machine.store, value));
  const bytes = left.map((byte, place) => bits(byte, right[place] ?? 0) & 255);
  return giveNew(machine, pair[0].type, pair[0].type === "binary" ? bytes : bytes.map((byte) => String.fromCharCode(byte)).join(""));
};

/**
 * @uses giveValue (src/machine/machine.mjs), makeLogic (src/machine/machine.mjs), makeDatum (src/data/datum.mjs),
 *   combineBytes, failTypes
 * @usedby NUMBER_NATIVES
 */
const combineBits = (logic, bits) => (machine, [left, right]) => {
  // Two logic values give a logic value. Integers, chars and tuples give a value of the type of the left value.
  if (left.type === "logic" && right.type === "logic") return giveValue(machine, makeLogic(logic(left.value, right.value)));
  if (left.type === "tuple" && ["tuple", "integer", "decimal"].includes(right.type)) {
    const other = right.type === "tuple" ? right.value : left.value.map(() => Math.trunc(right.value));
    return giveValue(machine, makeDatum("tuple", left.value.map((part, place) => bits(part, other[place] ?? 0) & 255)));
  }
  if (["string", "binary"].includes(left.type) && left.type === right.type) return combineBytes(machine, [left, right], bits);
  const plain = ["integer", "char"].includes(left.type) && left.type === right.type;
  return plain ? giveValue(machine, makeDatum(left.type, bits(left.value, right.value))) : failTypes(machine, [left, right]);
};

/**
 * @uses giveValue (src/machine/machine.mjs), complementBitset, makeDatum (src/data/datum.mjs), combineBytes,
 *   makeLogic (src/machine/machine.mjs)
 * @usedby NUMBER_NATIVES
 */
const complementValue = (machine, [value]) => {
  if (value.type === "bitset") return giveValue(machine, complementBitset(value));
  if (value.type === "char") return giveValue(machine, makeDatum("char", 255 - value.value));
  if (["string", "binary"].includes(value.type)) return combineBytes(machine, [value, value], (byte) => 255 - byte);
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
 * @usedby NATIVES (src/session/globals.mjs)
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
