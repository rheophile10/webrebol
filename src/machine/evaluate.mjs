/** @import { Machine } from "../types/states.mjs" */
import { NONE, UNSET, isList, makeKey, readRest, readWord, writeWord } from "../store/store.mjs";
import { advance, atEnd, failMachine, giveValue, isFunction, popFrame, pushFrame, readItem, startBlock } from "./machine.mjs";
import { startCall } from "./call.mjs";

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
  if (value.type === "unset") return failMachine(machine, "script no-value");
  return isFunction(value) ? startCall(machine, value, []) : giveValue(machine, value);
};

/**
 * @uses isList (src/store/store.mjs), readRest (src/store/store.mjs), NONE (src/store/store.mjs),
 *   makeKey (src/store/store.mjs)
 * @usedby evaluatePath
 */
const selectPart = (store, value, part) => {
  // A number selects by position. A word selects the value after the same word.
  if (!isList(value)) return null;
  const items = readRest(store, value);
  if (part.type === "integer") return items[part.value - 1] ?? NONE;
  const sameWord = (item) => typeof item.value === "string" && makeKey(item.value) === makeKey(String(part.value));
  const place = items.findIndex(sameWord);
  return place < 0 ? null : (items[place + 1] ?? NONE);
};

/**
 * @uses readRest (src/store/store.mjs), readWord (src/store/store.mjs), failMachine, isFunction, startCall,
 *   makeKey (src/store/store.mjs), selectPart, giveValue
 * @usedby EVALUATORS
 */
const evaluatePath = (machine, path) => {
  // The first word gives the start value. For a function, the other parts are refinements.
  const [head, ...parts] = readRest(machine.store, path);
  const value = readWord(machine.store, head);
  if (value.type === "unset") return failMachine(machine, "script no-value");
  if (isFunction(value)) return startCall(machine, value, parts.map((part) => makeKey(String(part.value))));
  // For other values, each part selects in the result of the part before it.
  const select = (current, part) => (current === null ? null : selectPart(machine.store, current, part));
  const found = parts.reduce(select, value);
  return found === null ? failMachine(machine, "script invalid-path") : giveValue(machine, found);
};

/**
 * @uses evaluateWord, pushFrame, stepSet, giveValue, readWord (src/store/store.mjs), startBlock, evaluatePath
 * @usedby evaluateOperand
 */
const EVALUATORS = {
  word: evaluateWord,
  "set-word": (machine, word) => ({ ...pushFrame(machine, { step: stepSet, word }), mode: "next" }),
  "get-word": (machine, word) => giveValue(machine, readWord(machine.store, word)),
  "lit-word": (machine, word) => giveValue(machine, { ...word, type: "word" }),
  paren: startBlock,
  path: evaluatePath,
  "lit-path": (machine, path) => giveValue(machine, { ...path, type: "path" }),
};

/**
 * Evaluates the value at the cursor, without a look for an operator after it.
 * @param {Machine} machine
 * @returns {Machine}
 * @standard end - At the end of the block, the result is the unset value.
 * @todo Evaluate a set-path.
 * @uses atEnd, giveValue, UNSET (src/store/store.mjs), readItem, EVALUATORS, advance
 * @usedby MODES
 */
export const evaluateOperand = (machine) => {
  // A type without an evaluator gives the value itself.
  if (atEnd(machine)) return giveValue(machine, UNSET);
  const item = readItem(machine);
  return (EVALUATORS[item.type] ?? giveValue)(advance(machine), item);
};
