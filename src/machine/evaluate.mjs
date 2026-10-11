/** @import { Machine } from "../types/states.mjs" */
import { UNSET, readWord, writeWord } from "../store/store.mjs";
import { advance, atEnd, failMachine, giveValue, isFunction, popFrame, pushFrame, readItem, startBlock } from "./machine.mjs";
import { startCall } from "./call.mjs";
import { evaluatePath, startSetPath } from "./path.mjs";

const DECAYS = { "lit-word": "word", "lit-path": "path" };

/**
 * @uses failMachine, popFrame, writeWord (src/store/store.mjs)
 * @usedby EVALUATORS
 */
const stepSet = (machine, frame) =>
  // A set-word needs a value.
  machine.value.type === "unset"
    ? failMachine(popFrame(machine), "script need-value", [frame.word])
    : { ...popFrame(machine), store: writeWord(machine.store, frame.word, machine.value) };

/**
 * @uses readWord (src/store/store.mjs), failMachine, isFunction, startCall, giveValue, DECAYS
 * @usedby EVALUATORS
 */
const evaluateWord = (machine, word) => {
  // A word gives its value. A function value starts a call.
  const value = readWord(machine.store, word);
  if (value.type === "unset") return failMachine(machine, "script no-value", [{ ...word, type: "word" }]);
  if (isFunction(value)) return startCall(machine, value, { names: [], label: word.value });
  // In REBOL 2, a word that holds a lit-word gives a word, and a word that holds a lit-path gives a path.
  return giveValue(machine, DECAYS[value.type] === undefined ? value : { ...value, type: DECAYS[value.type] });
};

/**
 * @uses readWord (src/store/store.mjs), failMachine, giveValue
 * @usedby EVALUATORS
 */
const readGetWord = (machine, word) => {
  // A get-word gives the value of its word, also a function value. A word without a value is an error.
  const value = readWord(machine.store, word);
  return value.type === "unset" ? failMachine(machine, "script no-value", [{ ...word, type: "word" }]) : giveValue(machine, value);
};

/**
 * @uses evaluateWord, pushFrame, stepSet, readGetWord, giveValue, startBlock, evaluatePath, startSetPath
 * @usedby evaluateOperand
 */
const EVALUATORS = {
  word: evaluateWord,
  "set-word": (machine, word) => ({ ...pushFrame(machine, { step: stepSet, word }), mode: "next" }),
  "get-word": readGetWord,
  "lit-word": (machine, word) => giveValue(machine, { ...word, type: "word" }),
  paren: startBlock,
  path: evaluatePath,
  "set-path": startSetPath,
  "lit-path": (machine, path) => giveValue(machine, { ...path, type: "path" }),
};

/**
 * Evaluates the value at the cursor, without a look for an operator after it.
 * @param {Machine} machine
 * @returns {Machine}
 * @standard end - At the end of the block, the result is the unset value.
 * @uses atEnd, giveValue, UNSET (src/store/store.mjs), readItem, isFunction, startCall, advance, EVALUATORS
 * @usedby MODES
 */
export const evaluateOperand = (machine) => {
  // A type without an evaluator gives the value itself.
  if (atEnd(machine)) return giveValue(machine, UNSET);
  const item = readItem(machine);
  // A function value in a block is called, as the function of a word is.
  if (isFunction(item)) return startCall(advance(machine), item, { names: [], label: "function" });
  return (EVALUATORS[item.type] ?? giveValue)(advance(machine), item);
};
