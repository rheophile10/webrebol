import { makeDatum } from "../data/datum.mjs";
import { failMachine, giveValue, makeLogic } from "../machine/machine.mjs";
import { complementBitset } from "./bitsets.mjs";
import { readNumbers } from "./scalars.mjs";
import { readBytes } from "./digest.mjs";
import { giveNew } from "./series.mjs";
import { makeSeries } from "../store/store.mjs";
import { readRows } from "../store/pictures.mjs";

const DEGREES = Math.PI / 180;
const NANOSECONDS = 1e9;
const MONEY_DIGITS = 15;

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

const INTEGER_MAX = 2147483647;

/**
 * @uses readNumbers, NANOSECONDS, giveValue (src/machine/machine.mjs), makeLogic (src/machine/machine.mjs)
 * @usedby NUMBER_NATIVES
 */
const testParity = (odd) => (machine, [number]) => {
  // A time uses its seconds. REBOL 2.7.8 has a defect for a number that is too large for 32 bits. WebRebol does not copy it.
  const [amount] = readNumbers(number);
  const whole = number.type === "time" ? Math.round(amount / NANOSECONDS) : Math.trunc(amount);
  return giveValue(machine, makeLogic((Math.abs(whole % 2) === 1) === odd));
};

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

/**
 * @usedby roundNumber, takeModulo
 */
const readAmount = (value) => (value.type === "money" ? value.value.amount : value.value);

/**
 * @usedby roundNumber
 */
const roundAway = (number) => Math.sign(number) * Math.floor(Math.abs(number) + 0.5);

/**
 * @usedby roundNumber
 */
const snapHalf = (quotient) => {
  // A division loses its last bits: 1.15 / 0.1 is 11.499999999999998. A quotient that is almost a half becomes that half.
  const half = Math.round(quotient * 2) / 2;
  const step = 2 ** (Math.floor(Math.log2(Math.abs(quotient) + Number.MIN_VALUE)) - 52);
  return Math.abs(quotient - half) <= 2 * step ? half : quotient;
};

/**
 * @uses NANOSECONDS, readAmount, failMachine (src/machine/machine.mjs), ROUNDERS, snapHalf, roundAway,
 *   giveValue (src/machine/machine.mjs), makeDatum (src/data/datum.mjs), MONEY_DIGITS, INTEGER_MAX
 * @usedby NUMBER_NATIVES
 */
const roundNumber = (machine, [number], options) => {
  // With /to, the result is a multiple of the scale. A time uses seconds, and a money value uses its amount.
  const unit = number.type === "time" ? NANOSECONDS : 1;
  // REBOL uses the scale without its sign.
  const scale = options.$to === undefined ? unit : Math.abs(readAmount(options.$to[0]));
  if (scale === 0) return failMachine(machine, "math zero-divide");
  const name = Object.keys(ROUNDERS).find((key) => options[key] !== undefined);
  const quotient = snapHalf(readAmount(number) / scale);
  const rounded = (name === undefined ? roundAway : ROUNDERS[name])(quotient) * scale;
  if (number.type === "time") return giveValue(machine, makeDatum("time", Math.round(rounded)));
  // A money value, or a scale that is a money value, gives a money value. The product with the scale can add false digits.
  const money = [number, options.$to?.[0]].find((value) => value?.type === "money");
  if (money !== undefined) return giveValue(machine, makeDatum("money", { ...money.value, amount: Number(rounded.toPrecision(MONEY_DIGITS)) }));
  const whole = options.$to === undefined || options.$to[0].type === "integer";
  if (whole && Math.abs(rounded) > INTEGER_MAX) return failMachine(machine, "math overflow");
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
 * @uses readRows (src/store/pictures.mjs), makeSeries (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby complementValue
 */
const complementImage = (machine, image) => {
  // A new image has the complement of each byte of each pixel, also of the alpha byte.
  const rows = readRows(machine.store, image).map((row) => row.map((pixel) => ~pixel));
  const made = makeSeries(machine.store, "image", rows);
  return giveValue({ ...machine, store: made.store }, { ...made.value, value: { ...made.value.value, size: image.value.size } });
};

/**
 * @uses giveValue (src/machine/machine.mjs), complementBitset, complementImage, makeDatum (src/data/datum.mjs),
 *   combineBytes, makeLogic (src/machine/machine.mjs)
 * @usedby NUMBER_NATIVES
 */
const complementValue = (machine, [value]) => {
  if (value.type === "bitset") return giveValue(machine, complementBitset(value));
  if (value.type === "image") return complementImage(machine, value);
  if (value.type === "char") return giveValue(machine, makeDatum("char", 255 - value.value));
  if (["string", "binary"].includes(value.type)) return combineBytes(machine, [value, value], (byte) => 255 - byte);
  if (value.type === "tuple") return giveValue(machine, makeDatum("tuple", value.value.map((byte) => 255 - byte)));
  return giveValue(machine, value.type === "logic" ? makeLogic(!value.value) : makeDatum("integer", ~value.value));
};

/**
 * @uses giveValue (src/machine/machine.mjs), makeDatum (src/data/datum.mjs)
 * @usedby NUMBER_NATIVES
 */
const shiftBits = (machine, [number, bits], options) => {
  // REBOL 2 uses only the low 5 bits of the count, as JavaScript does. With /logical, a shift to the right puts zeros at the left.
  const right = options.$logical === undefined ? number.value >> bits.value : (number.value >>> bits.value) | 0;
  return giveValue(machine, makeDatum("integer", options.$left === undefined ? right : number.value << bits.value));
};

/**
 * @uses readAmount, failMachine (src/machine/machine.mjs), giveValue (src/machine/machine.mjs),
 *   makeDatum (src/data/datum.mjs)
 * @usedby NUMBER_NATIVES
 */
const takeModulo = (machine, [left, right]) => {
  // The result has the sign of the divisor.
  const [amount, divisor] = [readAmount(left), readAmount(right)];
  if (divisor === 0) return failMachine(machine, "math zero-divide");
  const rest = amount % divisor;
  const positive = rest < 0 ? rest + Math.abs(divisor) : rest;
  // A result that is almost zero, or almost the divisor, is zero.
  const near = Math.abs(divisor) * 1e-12;
  const result = positive < near || Math.abs(divisor) - positive < near ? 0 : positive;
  if (left.type === "money") return giveValue(machine, makeDatum("money", { ...left.value, amount: result }));
  return giveValue(machine, makeDatum(left.type === "integer" && right.type === "integer" ? "integer" : "decimal", result));
};

/**
 * The natives for the other functions of numbers. Each entry has the name of REBOL and the function.
 * @uses testNumber, testParity, raise, calculate, turn, turnBack, roundNumber, combineBits, complementValue,
 *   shiftBits, takeModulo
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const NUMBER_NATIVES = {
  "zero?": testNumber((number) => number === 0),
  "positive?": testNumber((number) => number > 0),
  "negative?": testNumber((number) => number < 0),
  "even?": testParity(false),
  "odd?": testParity(true),
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
