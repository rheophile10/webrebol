import { makeDatum } from "../data/datum.mjs";
import { failMachine, giveValue, makeWord } from "../machine/machine.mjs";

const INTEGER_LIMIT = 2147483648;

/**
 * @usedby calculate
 */
const isNumber = (value) => value.type === "integer" || value.type === "decimal";

/**
 * @uses failMachine (src/machine/machine.mjs), giveValue (src/machine/machine.mjs), makeDatum (src/data/datum.mjs),
 *   INTEGER_LIMIT
 * @usedby calculate, change
 */
const giveNumber = (machine, whole, result) => {
  // Two integers give an integer if the result is a whole number that 32 bits can hold.
  if (!Number.isFinite(result)) return failMachine(machine, "math overflow");
  if (!whole || !Number.isInteger(result)) return giveValue(machine, makeDatum("decimal", result));
  const fits = result >= -INTEGER_LIMIT && result < INTEGER_LIMIT;
  return fits ? giveValue(machine, makeDatum("integer", result)) : failMachine(machine, "math overflow");
};

/**
 * @uses isNumber, failMachine (src/machine/machine.mjs), makeWord (src/machine/machine.mjs),
 *   makeDatum (src/data/datum.mjs), giveNumber
 * @usedby divide, MATH_NATIVES
 */
const calculate = (name, operation) => (machine, [left, right]) => {
  // An operator can give a value that is not a number, because it does not examine the types.
  const wrong = [left, right].find((value) => !isNumber(value));
  if (wrong !== undefined) {
    return failMachine(machine, "script cannot-use", [makeWord(name), makeDatum("datatype", wrong.type)]);
  }
  const whole = left.type === "integer" && right.type === "integer";
  return giveNumber(machine, whole, operation(left.value, right.value));
};

/**
 * @uses failMachine (src/machine/machine.mjs), calculate
 * @usedby MATH_NATIVES
 */
const divide = (name, operation) => (machine, [left, right]) =>
  right.value === 0 ? failMachine(machine, "math zero-divide") : calculate(name, operation)(machine, [left, right]);

/**
 * @uses giveNumber
 * @usedby MATH_NATIVES
 */
const change = (operation) => (machine, [number]) =>
  giveNumber(machine, number.type === "integer", operation(number.value));

/**
 * The natives for arithmetic. Each entry has the name of REBOL and the function.
 * @uses calculate, divide, change
 * @usedby NATIVES
 */
export const MATH_NATIVES = {
  add: calculate("add", (left, right) => left + right),
  subtract: calculate("subtract", (left, right) => left - right),
  multiply: calculate("multiply", (left, right) => left * right),
  divide: divide("divide", (left, right) => left / right),
  remainder: divide("remainder", (left, right) => left % right),
  negate: change((number) => 0 - number),
  absolute: change(Math.abs),
  abs: change(Math.abs),
};
