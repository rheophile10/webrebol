/** @import { Datum, Machine } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { NONE, isText, makeRecord, readRest } from "../store/store.mjs";
import { giveValue, makeWord, popFrame, pushFrame, startBlock } from "../machine/machine.mjs";
import { ERROR_IDS } from "./errorids.mjs";

const FIELDS = ["code", "type", "id", "arg1", "arg2", "arg3", "near", "where"];
const USER_CODE = 800;

/**
 * @uses ERROR_IDS, makeDatum (src/data/datum.mjs), USER_CODE
 * @usedby disarmError
 */
const readCode = (fault) => {
  // The code is the first code of the category and the position of the id in the category.
  const [type, id] = fault.value.split(" ");
  const category = ERROR_IDS[type];
  const place = category === undefined ? -1 : category.ids.indexOf(id);
  // REBOL adds 2 to the code of an error that `make` made from a block.
  return makeDatum("integer", place < 0 || type === "user" ? USER_CODE : category.code + place + (fault.shift ?? 0));
};

/**
 * @uses NONE (src/store/store.mjs), readCode, makeWord (src/machine/machine.mjs), makeRecord (src/store/store.mjs),
 *   FIELDS, giveValue (src/machine/machine.mjs)
 * @usedby FAULT_NATIVES
 */
const disarmError = (machine, [fault]) => {
  // TODO: Give the fields near and where.
  const [type, id] = fault.value.split(" ");
  const fields = [0, 1, 2].map((place) => fault.args?.[place] ?? NONE);
  const values = [readCode(fault), makeWord(type), makeWord(id), ...fields, NONE, NONE];
  const made = makeRecord(machine.store, FIELDS, values);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * Makes an error value from a text or from a block that has the type, the id and the fields.
 * @param {Machine} machine
 * @param {Datum} spec - The text or the block.
 * @returns {Machine}
 * @uses isText (src/store/store.mjs), giveValue (src/machine/machine.mjs), makeDatum (src/data/datum.mjs),
 *   readRest (src/store/store.mjs)
 * @usedby MAKERS
 */
export const makeError = (machine, spec) => {
  // A text gives a user error. Its text is the first field.
  if (isText(spec)) return giveValue(machine, { ...makeDatum("error", "user message"), args: [spec] });
  const [type, id, ...args] = readRest(machine.store, spec);
  return giveValue(machine, { ...makeDatum("error", `${type.value} ${id.value}`), args, shift: 2 });
};

/**
 * @uses popFrame (src/machine/machine.mjs), giveValue (src/machine/machine.mjs), NONE (src/store/store.mjs)
 * @usedby attemptBlock
 */
const unwindAttempt = (machine, frame) => {
  // An error stops at its attempt, and the result is none.
  const popped = popFrame(machine);
  if (machine.thrown.kind !== "error") return popped;
  return { ...giveValue(popped, NONE), cursor: frame.cursor, thrown: null };
};

/**
 * @uses giveValue (src/machine/machine.mjs), popFrame (src/machine/machine.mjs), NONE (src/store/store.mjs)
 * @usedby attemptBlock
 */
const stepAttempt = (machine) =>
  machine.value.type === "error" ? giveValue(popFrame(machine), NONE) : popFrame(machine);

/**
 * @uses startBlock (src/machine/machine.mjs), pushFrame (src/machine/machine.mjs), stepAttempt, unwindAttempt
 * @usedby FAULT_NATIVES
 */
const attemptBlock = (machine, [block]) =>
  startBlock(pushFrame(machine, { step: stepAttempt, unwind: unwindAttempt, cursor: machine.cursor }), block);

/**
 * The natives for error values. Each entry has the name of REBOL and the function.
 * @uses disarmError, attemptBlock
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const FAULT_NATIVES = {
  disarm: disarmError,
  attempt: attemptBlock,
};
