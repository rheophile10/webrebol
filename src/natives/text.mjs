import { UNSET, makeSeries } from "../store/store.mjs";
import { formValue, moldValue } from "../store/mold.mjs";
import { giveValue } from "../machine/machine.mjs";
import { startReduce } from "./control.mjs";

/**
 * @uses giveValue (src/machine/machine.mjs), UNSET (src/store/store.mjs)
 * @usedby printValue
 */
const writeOutput = (machine, text) =>
  giveValue({ ...machine, store: { ...machine.store, output: machine.store.output + text } }, UNSET);

/**
 * @uses writeOutput, formValue (src/store/mold.mjs), startReduce
 * @usedby TEXT_NATIVES
 */
const printValue = (ending) => (machine, [value]) => {
  // A block is reduced first. Its results are formed with a space between them.
  const formValues = (reduced, values) =>
    writeOutput(reduced, values.map((item) => formValue(reduced.store, item)).join(" ") + ending);
  if (value.type === "block") return startReduce(machine, value, formValues);
  return writeOutput(machine, formValue(machine.store, value) + ending);
};

/**
 * @uses makeSeries (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby TEXT_NATIVES
 */
const giveText = (write) => (machine, [value]) => {
  const made = makeSeries(machine.store, "string", write(machine.store, value));
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * The natives that make text. Each entry has the specification and the function.
 * @uses printValue, giveText, moldValue (src/store/mold.mjs), formValue (src/store/mold.mjs)
 * @usedby NATIVES
 */
export const TEXT_NATIVES = {
  print: ["value", printValue("\n")],
  prin: ["value", printValue("")],
  mold: ["value", giveText(moldValue)],
  form: ["value", giveText(formValue)],
};
