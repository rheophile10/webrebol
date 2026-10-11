/** @import { Machine } from "../types/states.mjs" */
import { popFrame, pushFrame } from "./machine.mjs";
import { stepLook } from "./call.mjs";
import { evaluateOperand } from "./evaluate.mjs";

const BATCH = Array.from({ length: 1000 });
/**
 * @uses stepLook
 * @usedby MODES
 */
const LOOK = { step: stepLook };

/**
 * @usedby MODES
 */
const finish = (machine) => ({ ...machine, mode: "done" });

/**
 * @uses pushFrame, LOOK, evaluateOperand, finish, popFrame
 * @usedby stepMachine
 */
const MODES = {
  next: (machine) => ({ ...pushFrame(machine, LOOK), mode: "operand" }),
  operand: evaluateOperand,
  give: (machine) => (machine.frames === null ? finish(machine) : machine.frames.top.step(machine, machine.frames.top)),
  throw: (machine) =>
    machine.frames === null ? finish(machine) : (machine.frames.top.unwind ?? popFrame)(machine, machine.frames.top),
  done: (machine) => machine,
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
 * @uses stepBatch
 * @usedby interpretSource (src/natives/interpret.mjs), matchParen (src/natives/parse.mjs)
 */
export const runMachine = (machine, batches) =>
  machine.mode === "done" || batches <= 0 ? machine : runMachine(stepBatch(machine), batches - 1);
