import { makeDatum } from "../data/datum.mjs";
import { failMachine, giveValue } from "../machine/machine.mjs";

const INTEGER_LIMIT = 2147483648;
const NUMBERS = "value1 [number!] value2 [number!]";

/**
 * @usedby calculate
 */
const isNumber = (value) => value.type === "integer" || value.type === "decimal";

/**
 * @uses giveValue (src/machine/machine.mjs), makeDatum (src/data/datum.mjs), INTEGER_LIMIT,
 *   failMachine (src/machine/machine.mjs)
 * @usedby calculate, change
 */
const giveNumber = (machine, whole, result) => {
  // Two integers give an integer if the result is a whole number that 32 bits can hold.
  if (!whole || !Number.isInteger(result)) return giveValue(machine, makeDatum("decimal", result));
  const fits = result >= -INTEGER_LIMIT && result < INTEGER_LIMIT;
  return fits ? giveValue(machine, makeDatum("integer", result)) : failMachine(machine, "math overflow");
};

/**
 * @uses isNumber, failMachine (src/machine/machine.mjs), giveNumber
 * @usedby divide, MATH_NATIVES
 */
const calculate = (operation) => (machine, [left, right]) => {
  // An operator can give a value that is not a number, because it does not examine the types.
  if (!isNumber(left) || !isNumber(right)) return failMachine(machine, "script cannot-use");
  const whole = left.type === "integer" && right.type === "integer";
  return giveNumber(machine, whole, operation(left.value, right.value));
};

/**
 * @uses failMachine (src/machine/machine.mjs), calculate
 * @usedby MATH_NATIVES
 */
const divide = (operation) => (machine, [left, right]) =>
  right.value === 0 ? failMachine(machine, "math zero-divide") : calculate(operation)(machine, [left, right]);

/**
 * @uses giveNumber
 * @usedby MATH_NATIVES
 */
const change = (operation) => (machine, [number]) =>
  giveNumber(machine, number.type === "integer", operation(number.value));

/**
 * The natives for arithmetic. Each entry has the specification and the function.
 * @uses NUMBERS, calculate, divide, change
 * @usedby NATIVES
 */
export const MATH_NATIVES = {
  add: [NUMBERS, calculate((left, right) => left + right)],
  subtract: [NUMBERS, calculate((left, right) => left - right)],
  multiply: [NUMBERS, calculate((left, right) => left * right)],
  divide: [NUMBERS, divide((left, right) => left / right)],
  remainder: [NUMBERS, divide((left, right) => left % right)],
  negate: ["number [number!]", change((number) => 0 - number)],
  absolute: ["number [number!]", change(Math.abs)],
  abs: ["number [number!]", change(Math.abs)],
};
