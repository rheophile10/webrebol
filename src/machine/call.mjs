/** @import { Datum, Machine } from "../types/states.mjs" */
import { NONE, UNSET, makeSeries, readWord, writeContext } from "../store/store.mjs";
import { advance, atEnd, failMachine, giveValue, makeLogic, makeWord, popFrame, pushFrame, readItem, replaceTop, throwUnused } from "./machine.mjs";
import { acceptsType } from "./spec.mjs";

/**
 * @usedby makeOptions, startCall
 */
const findParams = (callee, name) => callee.value.refinements.find((refinement) => refinement.key === name)?.params;

/**
 * @uses writeContext (src/store/store.mjs)
 * @usedby stepBody, unwindBody
 */
const restoreBody = (machine, frame) => {
  // An inner call gives the old values back to the outer call. After the outer call, the words keep their values.
  const values = frame.saved.depth > 0 ? frame.saved : { ...machine.store.contexts[frame.context], depth: 0 };
  return { ...machine, cursor: frame.cursor, store: writeContext(machine.store, frame.context, values) };
};

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
 * @usedby invokeBody
 */
const countDepth = (saved) => (saved.depth ?? 0) + 1;

/**
 * @uses stepBody, unwindBody, makeArguments, countDepth, writeContext (src/store/store.mjs), pushFrame,
 *   UNSET (src/store/store.mjs)
 * @usedby invoke
 */
const invokeBody = (machine, frame) => {
  // Keep the old values of the words, because a function can call itself.
  const callee = frame.callee.value;
  const body = { step: stepBody, unwind: unwindBody, context: callee.context, cursor: machine.cursor };
  const saved = { depth: 0, ...machine.store.contexts[callee.context] };
  const values = { ...makeArguments(frame), depth: countDepth(saved) };
  const store = writeContext(machine.store, callee.context, values);
  return { ...pushFrame(machine, { ...body, saved }), store, cursor: { ...callee.body.value }, value: UNSET, mode: "give" };
};

/**
 * @uses findParams
 * @usedby invoke
 */
const makeOptions = (frame) => {
  // Each used refinement gets the list of its arguments. They come after the usual arguments.
  const takeOption = (made, name) => {
    const size = findParams(frame.callee, name).length;
    const taken = frame.args.slice(made.offset, made.offset + size);
    return { offset: made.offset + size, options: { ...made.options, [name]: taken } };
  };
  return frame.names.reduce(takeOption, { offset: frame.callee.value.params.length, options: {} }).options;
};

/**
 * @uses makeWord, failMachine, makeSeries (src/store/store.mjs)
 * @usedby invoke
 */
const failArgument = (machine, frame, param) => {
  // A function with a body that gets no value for a parameter has a different error.
  const names = [makeWord(frame.label), makeWord(param.name)];
  const absent = frame.callee.value.native === undefined && frame.args.some((value) => value.type === "unset");
  if (absent) return failMachine(machine, "script no-arg", names);
  // The third field of the error is the block of the types that the parameter accepts.
  const made = makeSeries(machine.store, "block", (param.types ?? []).map(makeWord));
  // The message for a person also tells the type of the value that the function got.
  const failed = failMachine({ ...machine, store: made.store }, "script expect-arg", [...names, made.value]);
  const given = frame.args[frame.order.indexOf(param)].type;
  return { ...failed, thrown: { ...failed.thrown, value: { ...failed.thrown.value, given } } };
};

/**
 * @uses acceptsType, failArgument, invokeBody, makeOptions
 * @usedby requestArgument, stepInfix
 */
const invoke = (machine, frame, checked) => {
  // An infix call does not examine the types of its arguments.
  const refuses = (param, place) => !acceptsType(param.types, frame.args[place]);
  const refused = checked ? frame.order.find(refuses) : undefined;
  if (refused !== undefined) return failArgument(machine, frame, refused);
  const native = frame.callee.value.native;
  return native === undefined ? invokeBody(machine, frame) : native(machine, frame.args, makeOptions(frame));
};

/**
 * @uses atEnd, UNSET (src/store/store.mjs), readItem, readWord (src/store/store.mjs), giveValue, advance
 * @usedby REQUESTS
 */
const takeLiteral = (machine) => {
  // A get-word in the position of a literal argument gives the value of its word.
  const item = atEnd(machine) ? UNSET : readItem(machine);
  const value = item.type === "get-word" ? readWord(machine.store, item) : item;
  return giveValue(atEnd(machine) ? machine : advance(machine), value);
};

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
/**
 * Starts the call of a function. The machine first collects the arguments from the block at the cursor.
 * @param {Machine} machine
 * @param {Datum} callee - The function value.
 * @param {{ names: string[], label: string }} call - The keys of the refinements of the call, and the word that named the function.
 * @returns {Machine}
 * @standard refinements - The arguments of the refinements come after the usual arguments, in the sequence of the call.
 * @uses findParams, failMachine, makeWord, requestArgument, pushFrame, stepArguments
 * @usedby evaluateWord, evaluatePath
 */
export const startCall = (machine, callee, call) => {
  // A refinement that the function does not have is an error.
  const unknown = call.names.find((name) => findParams(callee, name) === undefined);
  if (unknown !== undefined) {
    return failMachine(machine, "script no-refine", [makeWord(call.label), makeWord(unknown.slice(1))]);
  }
  const order = [...callee.value.params, ...call.names.flatMap((name) => findParams(callee, name))];
  return requestArgument(pushFrame(machine, { ...call, step: stepArguments, callee, order, args: [] }));
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
