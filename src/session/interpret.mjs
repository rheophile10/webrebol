/** @import { Machine } from "../types/states.mjs" */
import { loadSource } from "../data/load.mjs";
import { NONE, allocate } from "../store/store.mjs";
import { moldValue } from "../store/mold.mjs";
import { makeMachine } from "../machine/machine.mjs";
import { failSyntax } from "../natives/control.mjs";
import { runMachine } from "../machine/run.mjs";
import { START_STORE } from "./globals.mjs";
import { findError } from "../natives/report.mjs";

/**
 * @uses allocate (src/store/store.mjs), START_STORE
 * @usedby startSource
 */
const EMPTY_BLOCK = allocate(START_STORE, { type: "block", value: [] });

/**
 * Makes a machine that is ready to evaluate a REBOL source text in a new session.
 * @param {string} source - The REBOL source text.
 * @param {{ disk?: object, started?: number, seed?: number }} [session] - The disk, the start time and the random seed of the session.
 * @returns {Machine}
 * @standard syntax - A source text that is not valid REBOL gives a machine that throws the error of the loader.
 * @uses loadSource (src/data/load.mjs), failSyntax (src/natives/control.mjs), makeMachine (src/machine/machine.mjs),
 *   EMPTY_BLOCK, allocate (src/store/store.mjs), START_STORE
 * @usedby interpretWithEdge (src/edge/drive.mjs), interpretSource, makeScript (test/disk.test.mjs)
 */
export const startSource = (source, session = {}) => {
  const loaded = loadSource(source);
  if (loaded.type === "error") return failSyntax(makeMachine(EMPTY_BLOCK.store, EMPTY_BLOCK.value), loaded);
  const made = allocate({ ...START_STORE, ...session }, loaded);
  return makeMachine(made.store, made.value);
};

/**
 * Evaluates a REBOL source text in a new session, without an edge.
 * @param {string} source - The REBOL source text.
 * @param {number} batches - The budget, in groups of 1000 steps.
 * @returns {Machine}
 * @standard reference - The result is the result that `do` of REBOL 2.7.8 gives.
 * @standard syntax - A source text that is not valid REBOL gives a machine with the error of the loader.
 * @uses runMachine (src/machine/run.mjs), startSource
 * @usedby showRun (test/do.test.mjs)
 */
export const interpretSource = (source, batches) => runMachine(startSource(source), batches);

/**
 * Makes the text that shows the end of an evaluation: the molded result, or the error.
 * @param {Machine} machine
 * @returns {string}
 * @standard error - An error shows as "!", its type, its id, and its three molded fields.
 * @uses findError (src/natives/report.mjs), moldValue (src/store/mold.mjs), NONE (src/store/store.mjs)
 * @usedby showEnd (bin/webrebol.mjs), showRun (test/do.test.mjs), showRun (test/edge.test.mjs)
 */
export const showResult = (machine) => {
  if (machine.mode !== "done") return machine.mode === "wait" ? "! wait" : "! budget";
  // An error value that is the result of the source text is also an error.
  const fault = findError(machine);
  if (fault === null) return moldValue(machine.store, machine.value);
  const fields = [0, 1, 2].map((place) => moldValue(machine.store, fault.args?.[place] ?? NONE));
  return `! ${fault.value} ${fields.join(" ")}`;
};
