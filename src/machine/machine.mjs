/** @import { Datum, Store, Machine } from "../types/states.mjs" */
/** @import { Frame } from "../types/processes.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { UNSET } from "../store/store.mjs";
import { readEntry } from "../store/table.mjs";

const FUNCTION_TYPES = ["native", "action", "op", "function"];

/**
 * Makes a logic value.
 * @param {boolean} truth
 * @returns {Datum}
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby 26 declarations in call, bitsets, compare, crypto, encode, files, flow, items, numbers, objects, parse, random, search, series, words, globals, layout
 */
export const makeLogic = (truth) => makeDatum("logic", truth);

/**
 * Finds if REBOL uses a value as true. Only none and false are not true.
 * @param {Datum} value
 * @returns {boolean}
 * @usedby 11 declarations in compare, control, flow, items, loops, words
 */
export const isTrue = (value) => value.type !== "none" && value.value !== false;

/**
 * Finds if a value is a function that the machine can call.
 * @param {Datum} value
 * @returns {boolean}
 * @uses FUNCTION_TYPES
 * @usedby evaluateWord, evaluateOperand, walkPart, evaluatePath, doValue (src/natives/control.mjs)
 */
export const isFunction = (value) => FUNCTION_TYPES.includes(value.type);

/**
 * Puts a frame on the top of the stack.
 * @param {Machine} machine
 * @param {Frame} frame
 * @returns {Machine}
 * @usedby 24 declarations in call, evaluate, machine, path, run, control, faults, flow, items, loops, objects, words
 */
export const pushFrame = (machine, frame) => ({
  ...machine,
  frames: { top: frame, below: machine.frames, depth: (machine.frames?.depth ?? 0) + 1 },
});

/**
 * Removes the top frame of the stack.
 * @param {Machine} machine
 * @returns {Machine}
 * @usedby 29 declarations in call, evaluate, machine, path, run, control, faults, flow, items, loops, objects, words
 */
export const popFrame = (machine) => ({ ...machine, frames: machine.frames.below });

/**
 * Puts a new frame in the position of the top frame.
 * @param {Machine} machine
 * @param {Frame} frame
 * @returns {Machine}
 * @usedby stepArguments, stepReduce (src/natives/control.mjs), stepCase (src/natives/flow.mjs),
 *   stepCompose (src/natives/flow.mjs), stepList (src/natives/loops.mjs), stepEach (src/natives/loops.mjs),
 *   stepWhile (src/natives/loops.mjs)
 */
export const replaceTop = (machine, frame) => ({ ...machine, frames: { ...machine.frames, top: frame } });

/**
 * Gives a value to the top frame at the next step.
 * @param {Machine} machine
 * @param {Datum} value
 * @returns {Machine}
 * @usedby 142 declarations in call, evaluate, machine, path, bitsets, clock, compare, control, convert, crypto, digest, edit, encode, faults, files, flow, items, loops, math, numbers, objects, parse, random, search, series, strings, text, words, elements, grid, layout, raster, windows
 */
export const giveValue = (machine, value) => ({ ...machine, value, mode: "give" });

/**
 * Starts a thrown value on its way up the stack.
 * @param {Machine} machine
 * @param {string} kind - "error", "return" or "break".
 * @param {Datum} value
 * @returns {Machine}
 * @usedby failMachine, throwUnused, CONTROL_NATIVES (src/natives/control.mjs), throwNamed (src/natives/flow.mjs),
 *   LOOP_NATIVES (src/natives/loops.mjs), stopMachine (src/natives/words.mjs)
 */
export const throwValue = (machine, kind, value) => ({ ...machine, mode: "throw", thrown: { kind, value } });

/**
 * Starts a REBOL error on its way up the stack.
 * @param {Machine} machine
 * @param {string} text - The type and the id of the error, for example "math overflow".
 * @param {Datum[]} [args] - The values of the fields arg1, arg2 and arg3 of the error.
 * @returns {Machine}
 * @uses throwValue, makeDatum (src/data/datum.mjs)
 * @usedby 52 declarations in call, evaluate, path, run, bitsets, compare, control, convert, crypto, digest, edit, encode, files, items, math, numbers, objects, random, search, series, words
 */
export const failMachine = (machine, text, args = []) =>
  throwValue(machine, "error", { ...makeDatum("error", text), args });

/**
 * Makes a word value that is not in a block. An error uses it to name a function or a parameter.
 * @param {string} name
 * @returns {Datum}
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby 13 declarations in call, clock, faults, files, items, math, parse, series, words, layout
 */
export const makeWord = (name) => makeDatum("word", name);

/**
 * Makes the unwind function of a frame that stops one kind of thrown value. The thrown value becomes the result.
 * @param {string} kind - "error", "return", "break" or "throw".
 * @returns {Function}
 * @standard other - A thrown value of a different kind continues up the stack.
 * @uses popFrame, giveValue
 * @usedby tryBlock (src/natives/control.mjs), catchThrow (src/natives/flow.mjs), stopBreak (src/natives/loops.mjs)
 */
export const stopThrown = (kind) => (machine, frame) => {
  const popped = popFrame(machine);
  if (machine.thrown.kind !== kind) return popped;
  return { ...giveValue(popped, machine.thrown.value), cursor: frame.cursor, thrown: null };
};

/**
 * Stops the machine until an edge module gives an answer. The edge does the work that a pure function cannot do.
 * @param {Machine} machine
 * @param {{ kind: string, resume: Function }} request - The work for the edge, and the function that continues with the answer.
 * @returns {Machine}
 * @standard wait - The mode of the machine is "wait".
 * @usedby readClock (src/natives/clock.mjs), askCrypto (src/natives/crypto.mjs), askDigest (src/natives/digest.mjs),
 *   waitForTime (src/natives/words.mjs), openWindow (src/view/windows.mjs), readImage (src/view/windows.mjs),
 *   downloadImage (src/view/windows.mjs)
 */
export const askEdge = (machine, request) => ({ ...machine, mode: "wait", request });

/**
 * Continues a machine that waits, with the answer of the edge.
 * @param {Machine} machine
 * @param {*} answer
 * @returns {Machine}
 * @standard resume - The function of the request gets the machine and the answer.
 * @usedby driveMachine (src/edge/drive.mjs), serveRequest (src/edge/page.mjs), continueAction (src/view/windows.mjs)
 */
export const answerRequest = (machine, answer) => machine.request.resume({ ...machine, mode: "give", request: null }, answer);

/**
 * Finds if the cursor is at the end of its block.
 * @param {Machine} machine
 * @returns {boolean}
 * @uses readEntry (src/store/table.mjs)
 * @usedby 13 declarations in call, evaluate, machine, control, flow
 */
export const atEnd = (machine) => machine.cursor.index >= readEntry(machine.store.series, machine.cursor.id).length;

/**
 * Gets the value at the cursor.
 * @param {Machine} machine
 * @returns {Datum}
 * @uses readEntry (src/store/table.mjs)
 * @usedby takeLiteral, takeFetched, readOperator, evaluateOperand, stepCase (src/natives/flow.mjs)
 */
export const readItem = (machine) => readEntry(machine.store.series, machine.cursor.id)[machine.cursor.index];

/**
 * Moves the cursor to the next value.
 * @param {Machine} machine
 * @returns {Machine}
 * @usedby takeLiteral, takeFetched, stepLook, evaluateOperand, stepCase (src/natives/flow.mjs)
 */
export const advance = (machine) => ({ ...machine, cursor: { ...machine.cursor, index: machine.cursor.index + 1 } });

/**
 * Continues a block after one of its expressions has a value.
 * @param {Machine} machine
 * @returns {Machine | null}
 * @standard error - An error value that no function uses becomes a thrown error. Without it, the result is null.
 * @uses atEnd, throwValue
 * @usedby stepBody, stepClosure, stepBlock
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
 * @usedby 25 declarations in evaluate, machine, control, faults, files, flow, items, loops, objects, words
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
 * @usedby runTest (bin/conform.mjs), matchParen (src/natives/parse.mjs), bootStore (src/session/globals.mjs),
 *   startSource (src/session/interpret.mjs), renderWindows (src/view/windows.mjs), runAction (src/view/windows.mjs),
 *   makeReady (test/machine.test.mjs)
 */
export const makeMachine = (store, block) =>
  startBlock({ store, cursor: null, value: UNSET, frames: null, mode: "give", thrown: null }, block);
