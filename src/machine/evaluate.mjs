/** @import { Machine } from "../types/states.mjs" */
import { UNSET, readWord, writeWord } from "../store/store.mjs";
import { advance, atEnd, failMachine, giveValue, isFunction, popFrame, pushFrame, readItem, startBlock } from "./machine.mjs";
import { startCall } from "./call.mjs";
import { evaluatePath, startSetPath } from "./path.mjs";

/**
 * @uses popFrame, writeWord (src/store/store.mjs)
 * @usedby EVALUATORS
 */
const stepSet = (machine, frame) => ({
  ...popFrame(machine),
  store: writeWord(machine.store, frame.word, machine.value),
});

/**
 * @uses readWord (src/store/store.mjs), failMachine, isFunction, startCall, giveValue
 * @usedby EVALUATORS
 */
const evaluateWord = (machine, word) => {
  // A word gives its value. A function value starts a call.
  const value = readWord(machine.store, word);
  if (value.type === "unset") return failMachine(machine, "script no-value", [{ ...word, type: "word" }]);
  return isFunction(value) ? startCall(machine, value, { names: [], label: word.value }) : giveValue(machine, value);
};

/**
 * @uses evaluateWord, pushFrame, stepSet, giveValue, readWord (src/store/store.mjs), startBlock, evaluatePath,
 *   startSetPath
 * @usedby evaluateOperand
 */
const EVALUATORS = {
  word: evaluateWord,
  "set-word": (machine, word) => ({ ...pushFrame(machine, { step: stepSet, word }), mode: "next" }),
  "get-word": (machine, word) => giveValue(machine, readWord(machine.store, word)),
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
 * @uses atEnd, giveValue, UNSET (src/store/store.mjs), readItem, EVALUATORS, advance
 * @usedby MODES
 */
export const evaluateOperand = (machine) => {
  // A type without an evaluator gives the value itself.
  if (atEnd(machine)) return giveValue(machine, UNSET);
  const item = readItem(machine);
  return (EVALUATORS[item.type] ?? giveValue)(advance(machine), item);
};
