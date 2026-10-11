/** @import { Machine } from "../types/states.mjs" */
import { loadSource } from "../data/load.mjs";
import { allocate } from "../store/store.mjs";
import { moldValue } from "../store/mold.mjs";
import { failMachine, makeMachine } from "../machine/machine.mjs";
import { runMachine } from "../machine/run.mjs";
import { START_STORE } from "./globals.mjs";

/**
 * @uses allocate (src/store/store.mjs), START_STORE
 * @usedby interpretSource
 */
const EMPTY_BLOCK = allocate(START_STORE, { type: "block", value: [] });

/**
 * Evaluates a REBOL source text in a new session.
 * @param {string} source - The REBOL source text.
 * @param {number} batches - The budget, in groups of 1000 steps.
 * @returns {Machine}
 * @standard reference - The result is the result that `do` of REBOL 2.7.8 gives.
 * @standard syntax - A source text that is not valid REBOL gives a machine with the error of the loader.
 * @uses loadSource (src/data/load.mjs), runMachine (src/machine/run.mjs), failMachine (src/machine/machine.mjs),
 *   makeMachine (src/machine/machine.mjs), EMPTY_BLOCK, allocate (src/store/store.mjs), START_STORE
 * @usedby machine (bin/webrebol.mjs), showRun (test/do.test.mjs)
 */
export const interpretSource = (source, batches) => {
  // A source text that does not load gives a machine that only holds the error.
  const loaded = loadSource(source);
  if (loaded.type === "error") {
    return runMachine(failMachine(makeMachine(EMPTY_BLOCK.store, EMPTY_BLOCK.value), loaded.value), 1);
  }
  const made = allocate(START_STORE, loaded);
  return runMachine(makeMachine(made.store, made.value), batches);
};

/**
 * Makes the text that shows the end of an evaluation: the molded result, or the error.
 * @param {Machine} machine
 * @returns {string}
 * @standard error - An error shows as "!" and its type and its id.
 * @uses moldValue (src/store/mold.mjs)
 * @usedby bin/webrebol.mjs, showRun (test/do.test.mjs)
 */
export const showResult = (machine) => {
  if (machine.mode !== "done") return "! budget";
  if (machine.thrown !== null) return `! ${machine.thrown.value.value}`;
  // An error value that is the result of the source text is also an error.
  return machine.value.type === "error" ? `! ${machine.value.value}` : moldValue(machine.store, machine.value);
};
