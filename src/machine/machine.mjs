/** @import { Datum, Store, Machine } from "../types/states.mjs" */
/** @import { Frame } from "../types/processes.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { UNSET } from "../store/store.mjs";

const FUNCTION_TYPES = ["native", "op", "function"];

/**
 * Makes a logic value.
 * @param {boolean} truth
 * @returns {Datum}
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby makeArguments, compare (src/natives/compare.mjs), equate (src/natives/compare.mjs),
 *   testType (src/natives/compare.mjs), COMPARE_NATIVES (src/natives/compare.mjs),
 *   CONSTANTS (src/natives/globals.mjs), SERIES_NATIVES (src/natives/series.mjs)
 */
export const makeLogic = (truth) => makeDatum("logic", truth);

/**
 * Finds if REBOL uses a value as true. Only none and false are not true.
 * @param {Datum} value
 * @returns {boolean}
 * @usedby COMPARE_NATIVES (src/natives/compare.mjs), stepWhile (src/natives/control.mjs),
 *   stepUntil (src/natives/control.mjs), chooseBlock (src/natives/control.mjs),
 *   CONTROL_NATIVES (src/natives/control.mjs)
 */
export const isTrue = (value) => value.type !== "none" && value.value !== false;

/**
 * Finds if a value is a function that the machine can call.
 * @param {Datum} value
 * @returns {boolean}
 * @uses FUNCTION_TYPES
 * @usedby evaluateWord, evaluatePath
 */
export const isFunction = (value) => FUNCTION_TYPES.includes(value.type);

/**
 * Puts a frame on the top of the stack.
 * @param {Machine} machine
 * @param {Frame} frame
 * @returns {Machine}
 * @usedby 11 declarations in call, evaluate, machine, run, control
 */
export const pushFrame = (machine, frame) => ({ ...machine, frames: { top: frame, below: machine.frames } });

/**
 * Removes the top frame of the stack.
 * @param {Machine} machine
 * @returns {Machine}
 * @usedby 15 declarations in call, evaluate, machine, run, control
 */
export const popFrame = (machine) => ({ ...machine, frames: machine.frames.below });

/**
 * Puts a new frame in the position of the top frame.
 * @param {Machine} machine
 * @param {Frame} frame
 * @returns {Machine}
 * @usedby stepArguments, stepList (src/natives/control.mjs), stepWhile (src/natives/control.mjs),
 *   stepReduce (src/natives/control.mjs)
 */
export const replaceTop = (machine, frame) => ({ ...machine, frames: { top: frame, below: machine.frames.below } });

/**
 * Gives a value to the top frame at the next step.
 * @param {Machine} machine
 * @param {Datum} value
 * @returns {Machine}
 * @usedby 28 declarations in call, evaluate, compare, control, math, series, text
 */
export const giveValue = (machine, value) => ({ ...machine, value, mode: "give" });

/**
 * Starts a thrown value on its way up the stack.
 * @param {Machine} machine
 * @param {string} kind - "error", "return" or "break".
 * @param {Datum} value
 * @returns {Machine}
 * @usedby failMachine, throwUnused, CONTROL_NATIVES (src/natives/control.mjs)
 */
export const throwValue = (machine, kind, value) => ({ ...machine, mode: "throw", thrown: { kind, value } });

/**
 * Starts a REBOL error on its way up the stack.
 * @param {Machine} machine
 * @param {string} text - The type and the id of the error, for example "math overflow".
 * @returns {Machine}
 * @uses throwValue, makeDatum (src/data/datum.mjs)
 * @usedby 12 declarations in call, evaluate, compare, control, interpret, math, series
 */
export const failMachine = (machine, text) => throwValue(machine, "error", makeDatum("error", text));

/**
 * Finds if the cursor is at the end of its block.
 * @param {Machine} machine
 * @returns {boolean}
 * @usedby stepBody, takeLiteral, readOperator, evaluateOperand, throwUnused, stepBlock,
 *   continueReduce (src/natives/control.mjs)
 */
export const atEnd = (machine) => machine.cursor.index >= machine.store.series[machine.cursor.id].length;

/**
 * Gets the value at the cursor.
 * @param {Machine} machine
 * @returns {Datum}
 * @usedby takeLiteral, readOperator, evaluateOperand
 */
export const readItem = (machine) => machine.store.series[machine.cursor.id][machine.cursor.index];

/**
 * Moves the cursor to the next value.
 * @param {Machine} machine
 * @returns {Machine}
 * @usedby takeLiteral, stepLook, evaluateOperand
 */
export const advance = (machine) => ({ ...machine, cursor: { ...machine.cursor, index: machine.cursor.index + 1 } });

/**
 * Continues a block after one of its expressions has a value.
 * @param {Machine} machine
 * @returns {Machine | null}
 * @standard error - An error value that no function uses becomes a thrown error. Without it, the result is null.
 * @uses atEnd, throwValue
 * @usedby stepBody, stepBlock
 */
export const throwUnused = (machine) =>
  !atEnd(machine) && machine.value.type === "error" ? throwValue(machine, "error", machine.value) : null;

/**
 * @uses atEnd, popFrame, throwUnused
 * @usedby startBlock
 */
const stepBlock = (machine, frame) => {
  if (atEnd(machine)) return { ...popFrame(machine), cursor: frame.cursor };
  return throwUnused(machine) ?? { ...machine, mode: "next" };
};

/**
 * Starts the evaluation of a block. The value of its last expression goes to the frame below.
 * @param {Machine} machine
 * @param {Datum} block
 * @returns {Machine}
 * @standard empty - An empty block gives the unset value.
 * @uses pushFrame, stepBlock, UNSET (src/store/store.mjs)
 * @usedby 12 declarations in evaluate, machine, control
 */
export const startBlock = (machine, block) => ({
  ...pushFrame(machine, { step: stepBlock, cursor: machine.cursor }),
  cursor: { ...block.value },
  value: UNSET,
  mode: "give",
});

/**
 * Makes a machine that is ready to evaluate a block.
 * @param {Store} store
 * @param {Datum} block
 * @returns {Machine}
 * @uses startBlock, UNSET (src/store/store.mjs)
 * @usedby interpretSource (src/natives/interpret.mjs), makeReady (test/machine.test.mjs)
 */
export const makeMachine = (store, block) =>
  startBlock({ store, cursor: null, value: UNSET, frames: null, mode: "give", thrown: null }, block);
