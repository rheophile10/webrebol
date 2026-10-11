/** @import { Datum, Store, Machine } from "../types/states.mjs" */
import { NONE } from "../store/store.mjs";
import { formValue, moldValue } from "../store/mold.mjs";

const TITLES = {
  syntax: "Syntax Error",
  script: "Script Error",
  math: "Math Error",
  access: "Access Error",
  user: "User Error",
  throw: "Throw Error",
};

/**
 * @usedby MESSAGES
 */
const describeArgument = (fields, given) =>
  given === undefined
    ? `The function "${fields[0]}" cannot use the value that it got for an argument.`
    : `The function "${fields[0]}" got a value of the type ${given}! for the argument "${fields[1]}". It accepts: ${fields[2].slice(1, -1)}`;

/**
 * @uses describeArgument
 * @usedby formatError
 */
const MESSAGES = {
  "syntax invalid": () => "The source text has a part that is not a REBOL value.",
  "syntax missing": (fields) => `The source text has no ${fields[1]} for a bracket that is open.`,
  "script no-value": (fields) => `The word "${fields[0]}" has no value. Set the word before you use it.`,
  "script no-arg": (fields) => `The function "${fields[0]}" got no value for the argument "${fields[1]}".`,
  "script expect-arg": describeArgument,
  "script no-refine": (fields) => `The function "${fields[0]}" has no refinement "/${fields[1]}".`,
  "script invalid-path": (fields) => `The value has no part with the name "${fields[0]}".`,
  "script out-of-range": (fields) => `The series has no position ${fields[0]}.`,
  "script past-end": () => "The series has no item at this position. The position is at the end or after it.",
  "script cannot-use": (fields) => `The function "${fields[0]}" cannot use a ${fields[1]} value.`,
  "script expect-set": (fields) => `The two values have types that do not go together: ${fields[0]} and ${fields[1]}.`,
  "script invalid-arg": (fields) => `The value ${fields[0]} is not correct for this function.`,
  "script bad-make-arg": () => "The function make cannot make this type from this value.",
  "access cannot-open": (fields) => `The disk has no file or folder with the name ${fields[0]}, or it cannot open it.`,
  "access no-delete": (fields) => `The disk cannot delete ${fields[0]}. It is not there, or it is a folder that is not empty.`,
  "access no-rename": (fields) => `The disk cannot give a new name to ${fields[0]}.`,
  "access no-make-dir": (fields) => `The disk cannot make the folder ${fields[0]}. The folder above it is not there.`,
  "syntax header": () => "The script file has no REBOL header.",
  "math zero-divide": () => "A division by zero is not possible.",
  "math overflow": () => "The result is too large for the type of the number.",
  "user message": (fields) => fields[0],
};

/**
 * @usedby formatError
 */
const describeOther = (fields) => `REBOL gives this error, but WebRebol has no message for it. Fields: ${fields.join(" ")}`;

/**
 * Makes the message that tells a person about an error.
 * @param {Store} store
 * @param {Datum} fault - The error value.
 * @returns {string}
 * @standard header - The message starts with "**" and the title of the error type, as in REBOL.
 * @standard identity - The message ends with the type and the id of REBOL in parentheses.
 * @keypoint The message texts are not the texts of REBOL. Only the type, the id and the fields agree with REBOL.
 * @uses formValue (src/store/mold.mjs), moldValue (src/store/mold.mjs), NONE (src/store/store.mjs), TITLES, MESSAGES,
 *   describeOther
 * @usedby showEnd (bin/webrebol.mjs)
 */
export const formatError = (store, fault) => {
  // A user error shows its text as it is. The other fields show as REBOL source text.
  const show = fault.value === "user message" ? formValue : moldValue;
  const fields = [0, 1, 2].map((place) => show(store, fault.args?.[place] ?? NONE));
  const title = TITLES[fault.value.split(" ")[0]] ?? "Error";
  const message = (MESSAGES[fault.value] ?? describeOther)(fields, fault.given);
  return `** ${title}: ${message} (${fault.value})`;
};

/**
 * Finds the error that ended an evaluation.
 * @param {Machine} machine
 * @returns {Datum | null}
 * @standard result - An error value that is the result of the source text is also the error.
 * @usedby showEnd (bin/webrebol.mjs), showResult
 */
export const findError = (machine) => {
  const fault = machine.thrown?.value ?? machine.value;
  return fault.type === "error" ? fault : null;
};
