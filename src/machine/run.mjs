/** @import { Machine } from "../types/states.mjs" */
import { failMachine, popFrame, pushFrame } from "./machine.mjs";
import { stepLook } from "./call.mjs";
import { evaluateOperand } from "./evaluate.mjs";

const BATCH = Array.from({ length: 1000 });
/**
 * @uses stepLook
 * @usedby startExpression
 */
const LOOK = { step: stepLook };

const DEPTH_LIMIT = 20000;

/**
 * @usedby MODES
 */
const finish = (machine) => ({ ...machine, mode: "done" });

/**
 * @uses DEPTH_LIMIT, failMachine, pushFrame, LOOK
 * @usedby MODES
 */
const startExpression = (machine) =>
  // REBOL gives an error when the evaluation is too deep, for example for a block that evaluates itself.
  (machine.frames?.depth ?? 0) > DEPTH_LIMIT
    ? failMachine(machine, "internal stack-overflow")
    : { ...pushFrame(machine, LOOK), mode: "operand" };

/**
 * @uses startExpression, evaluateOperand, finish, popFrame
 * @usedby stepMachine
 */
const MODES = {
  next: startExpression,
  operand: evaluateOperand,
  give: (machine) => (machine.frames === null ? finish(machine) : machine.frames.top.step(machine, machine.frames.top)),
  throw: (machine) =>
    machine.frames === null ? finish(machine) : (machine.frames.top.unwind ?? popFrame)(machine, machine.frames.top),
  done: (machine) => machine,
  wait: (machine) => machine,
};

/**
 * Does one step of the evaluation.
 * @param {Machine} machine
 * @returns {Machine}
 * @standard done - A machine that is done does not change.
 * @uses MODES
 * @usedby stepBatch
 */
export const stepMachine = (machine) => MODES[machine.mode](machine);

/**
 * @uses BATCH, stepMachine
 * @usedby runMachine
 */
const stepBatch = (machine) => BATCH.reduce(stepMachine, machine);

/**
 * Does steps until the evaluation is done or the budget is used.
 * @param {Machine} machine
 * @param {number} batches - The budget, in groups of 1000 steps.
 * @returns {Machine}
 * @standard budget - An evaluation that does not end stops when the budget is used, and its mode is not "done".
 * @standard wait - A machine that waits for the edge stops, and its mode is "wait".
 * @uses stepBatch
 * @usedby driveMachine (src/edge/drive.mjs), advance (src/edge/page.mjs), matchParen (src/natives/parse.mjs),
 *   bootStore (src/session/globals.mjs), interpretSource (src/session/interpret.mjs),
 *   renderWindows (src/view/windows.mjs), runAction (src/view/windows.mjs), makeScript (test/disk.test.mjs)
 */
export const runMachine = (machine, batches) =>
  ["done", "wait"].includes(machine.mode) || batches <= 0 ? machine : runMachine(stepBatch(machine), batches - 1);
