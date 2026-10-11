/** @import { Datum, Machine } from "../types/states.mjs" */
import { NONE, UNSET, readWord, writeContext } from "../store/store.mjs";
import { advance, atEnd, failMachine, giveValue, makeLogic, popFrame, pushFrame, readItem, replaceTop, throwUnused } from "./machine.mjs";
import { acceptsType } from "./spec.mjs";

/**
 * @uses writeContext (src/store/store.mjs)
 * @usedby stepBody, unwindBody
 */
const restoreBody = (machine, frame) => ({
  ...machine,
  cursor: frame.cursor,
  store: writeContext(machine.store, frame.context, frame.saved),
});

/**
 * @uses atEnd, restoreBody, popFrame, throwUnused
 * @usedby invokeBody
 */
const stepBody = (machine, frame) => {
  if (atEnd(machine)) return restoreBody(popFrame(machine), frame);
  return throwUnused(machine) ?? { ...machine, mode: "next" };
};

/**
 * @uses restoreBody, popFrame, giveValue
 * @usedby invokeBody
 */
const unwindBody = (machine, frame) => {
  // The words of the function get their old values. A return stops at its function.
  const restored = restoreBody(popFrame(machine), frame);
  return machine.thrown.kind === "return" ? { ...giveValue(restored, machine.thrown.value), thrown: null } : restored;
};

/**
 * @uses NONE (src/store/store.mjs), makeLogic
 * @usedby invokeBody
 */
const makeArguments = (frame) => {
  // Each word of the function is none, but a used refinement is true and a parameter has its argument.
  const empty = Object.fromEntries(frame.callee.value.keys.map((key) => [key, NONE]));
  const flags = Object.fromEntries(frame.names.map((name) => [name, makeLogic(true)]));
  const given = Object.fromEntries(frame.order.map((param, place) => [param.key, frame.args[place]]));
  return { ...empty, ...flags, ...given };
};

/**
 * @uses stepBody, unwindBody, writeContext (src/store/store.mjs), makeArguments, pushFrame,
 *   UNSET (src/store/store.mjs)
 * @usedby invoke
 */
const invokeBody = (machine, frame) => {
  // Keep the old values of the words, because a function can call itself.
  const callee = frame.callee.value;
  const body = { step: stepBody, unwind: unwindBody, context: callee.context, cursor: machine.cursor };
  const saved = machine.store.contexts[callee.context];
  const store = writeContext(machine.store, callee.context, makeArguments(frame));
  return { ...pushFrame(machine, { ...body, saved }), store, cursor: { ...callee.body.value }, value: UNSET, mode: "give" };
};

/**
 * @uses acceptsType, failMachine, invokeBody
 * @usedby requestArgument, stepInfix
 */
const invoke = (machine, frame, checked) => {
  // An infix call does not examine the types of its arguments.
  const accepts = (param, place) => acceptsType(param.types, frame.args[place]);
  const native = frame.callee.value.native;
  const absent = native === undefined && frame.args.some((value) => value.type === "unset");
  if (checked && !frame.order.every(accepts)) return failMachine(machine, absent ? "script no-arg" : "script expect-arg");
  return native === undefined ? invokeBody(machine, frame) : native(machine, frame.args, frame.names);
};

/**
 * @uses atEnd, giveValue, UNSET (src/store/store.mjs), advance, readItem
 * @usedby REQUESTS
 */
const takeLiteral = (machine) =>
  atEnd(machine) ? giveValue(machine, UNSET) : giveValue(advance(machine), readItem(machine));

/**
 * @uses takeLiteral
 * @usedby requestArgument
 */
const REQUESTS = { normal: (machine) => ({ ...machine, mode: "next" }), lit: takeLiteral, get: takeLiteral };

/**
 * @uses invoke, popFrame, REQUESTS
 * @usedby stepArguments, startCall
 */
const requestArgument = (machine) => {
  // When all arguments are there, the call starts.
  const frame = machine.frames.top;
  const param = frame.order[frame.args.length];
  return param === undefined ? invoke(popFrame(machine), frame, true) : REQUESTS[param.kind](machine);
};

/**
 * @uses requestArgument, replaceTop
 * @usedby startCall
 */
const stepArguments = (machine, frame) =>
  requestArgument(replaceTop(machine, { ...frame, args: [...frame.args, machine.value] }));

/**
 * @usedby startCall
 */
const findParams = (callee, name) => callee.value.refinements.find((refinement) => refinement.key === name)?.params;

/**
 * Starts the call of a function. The machine first collects the arguments from the block at the cursor.
 * @param {Machine} machine
 * @param {Datum} callee - The function value.
 * @param {string[]} names - The keys of the refinements of the call.
 * @returns {Machine}
 * @standard refinements - The arguments of the refinements come after the usual arguments, in the sequence of the call.
 * @uses findParams, failMachine, requestArgument, pushFrame, stepArguments
 * @usedby evaluateWord, evaluatePath
 */
export const startCall = (machine, callee, names) => {
  // A refinement that the function does not have is an error.
  if (names.some((name) => findParams(callee, name) === undefined)) return failMachine(machine, "script no-refine");
  const order = [...callee.value.params, ...names.flatMap((name) => findParams(callee, name))];
  return requestArgument(pushFrame(machine, { step: stepArguments, callee, names, order, args: [] }));
};

/**
 * @uses invoke, popFrame
 * @usedby stepLook
 */
const stepInfix = (machine, frame) =>
  invoke(popFrame(machine), { ...frame, names: [], order: frame.callee.value.params, args: [frame.left, machine.value] }, false);

/**
 * @uses atEnd, UNSET (src/store/store.mjs), readItem, readWord (src/store/store.mjs)
 * @usedby stepLook
 */
const readOperator = (machine) => {
  // An operator is a word at the cursor that has an op value.
  const item = atEnd(machine) ? UNSET : readItem(machine);
  const value = item.type === "word" ? readWord(machine.store, item) : UNSET;
  return value.type === "op" ? value : null;
};

/**
 * Continues an expression after it has a value. An operator at the cursor uses the value as its left argument.
 * @param {Machine} machine
 * @returns {Machine}
 * @standard sequence - Operators are applied from left to right, without precedence.
 * @uses readOperator, popFrame, pushFrame, advance, stepInfix
 * @usedby LOOK
 */
export const stepLook = (machine) => {
  // Without an operator, the value goes to the frame below.
  const callee = readOperator(machine);
  if (callee === null) return popFrame(machine);
  return { ...pushFrame(advance(machine), { step: stepInfix, callee, left: machine.value }), mode: "operand" };
};
