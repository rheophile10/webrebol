import { UNSET, isList, isSeries, makeSeries, readAll, readRest } from "../store/store.mjs";
import { formValue, moldValue } from "../store/mold.mjs";
import { giveValue } from "../machine/machine.mjs";
import { startReduce } from "./control.mjs";
import { insertContent, moveTo } from "./series.mjs";

/**
 * @usedby printValue, probeValue
 */
const writeOutput = (machine, text) => ({ ...machine, store: { ...machine.store, output: machine.store.output + text } });

/**
 * @uses formValue (src/store/mold.mjs)
 * @usedby printValue, reformValue
 */
const formAll = (store, values) => values.map((item) => formValue(store, item)).join(" ");

/**
 * @uses giveValue (src/machine/machine.mjs), writeOutput, formAll, UNSET (src/store/store.mjs), startReduce,
 *   formValue (src/store/mold.mjs)
 * @usedby TEXT_NATIVES
 */
const printValue = (ending) => (machine, [value]) => {
  // A block is reduced first. Its results are formed with a space between them.
  const printAll = (reduced, values) => giveValue(writeOutput(reduced, formAll(reduced.store, values) + ending), UNSET);
  if (value.type === "block") return startReduce(machine, value, printAll);
  return giveValue(writeOutput(machine, formValue(machine.store, value) + ending), UNSET);
};

/**
 * @uses makeSeries (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby giveText, rejoinValues, reformValue, remoldValue
 */
const giveSeries = (machine, type, content) => {
  const made = makeSeries(machine.store, type, content);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses giveSeries
 * @usedby remoldValue, TEXT_NATIVES
 */
const giveText = (write) => (machine, [value]) => giveSeries(machine, "string", write(machine.store, value));

/**
 * @uses giveValue (src/machine/machine.mjs), writeOutput, moldValue (src/store/mold.mjs)
 * @usedby TEXT_NATIVES
 */
const probeValue = (machine, [value]) => giveValue(writeOutput(machine, `${moldValue(machine.store, value)}\n`), value);

/**
 * @uses isSeries (src/store/store.mjs), readRest (src/store/store.mjs), formValue (src/store/mold.mjs),
 *   makeSeries (src/store/store.mjs)
 * @usedby joinValues, rejoinValues
 */
const makeBase = (machine, value) => {
  // A series gives a copy of itself. Other values give a string of the formed value.
  const type = isSeries(value) ? value.type : "string";
  const content = isSeries(value) ? readRest(machine.store, value) : formValue(machine.store, value);
  const made = makeSeries(machine.store, type, content);
  return { machine: { ...machine, store: made.store }, base: made.value };
};

/**
 * @uses isList (src/store/store.mjs), formValue (src/store/mold.mjs), moveTo, readAll (src/store/store.mjs),
 *   giveValue (src/machine/machine.mjs), insertContent
 * @usedby joinValues, rejoinValues
 */
const appendAll = (machine, base, values) => {
  // A list gets the values as its items. A text gets each value as formed text. The result is the base.
  const content = isList(base) ? values : values.map((value) => formValue(machine.store, value)).join("");
  const tail = moveTo(base, readAll(machine.store, base).length);
  return giveValue(insertContent(machine, tail, content), base);
};

/**
 * @uses makeBase, appendAll, startReduce
 * @usedby TEXT_NATIVES
 */
const joinValues = (machine, [value, rest]) => {
  const made = makeBase(machine, value);
  const finish = (reduced, values) => appendAll(reduced, made.base, values);
  return rest.type === "block" ? startReduce(made.machine, rest, finish) : finish(made.machine, [rest]);
};

/**
 * @uses giveSeries, makeBase, appendAll, startReduce
 * @usedby TEXT_NATIVES
 */
const rejoinValues = (machine, [block]) => {
  // The first result gives the type of the result. An empty block gives an empty block.
  const finish = (reduced, values) => {
    if (values.length === 0) return giveSeries(reduced, "block", []);
    const made = makeBase(reduced, values[0]);
    return appendAll(made.machine, made.base, values.slice(1));
  };
  return startReduce(machine, block, finish);
};

/**
 * @uses giveSeries, formAll, startReduce
 * @usedby TEXT_NATIVES
 */
const reformValue = (machine, [value]) => {
  const finish = (reduced, values) => giveSeries(reduced, "string", formAll(reduced.store, values));
  return value.type === "block" ? startReduce(machine, value, finish) : finish(machine, [value]);
};

/**
 * @uses makeSeries (src/store/store.mjs), giveSeries, moldValue (src/store/mold.mjs), startReduce, giveText
 * @usedby TEXT_NATIVES
 */
const remoldValue = (machine, [value]) => {
  const finish = (reduced, values) => {
    const made = makeSeries(reduced.store, "block", values);
    return giveSeries({ ...reduced, store: made.store }, "string", moldValue(made.store, made.value));
  };
  return value.type === "block" ? startReduce(machine, value, finish) : giveText(moldValue)(machine, [value]);
};

/**
 * The natives that make text. Each entry has the name of REBOL and the function.
 * @uses printValue, probeValue, giveText, moldValue (src/store/mold.mjs), formValue (src/store/mold.mjs), joinValues,
 *   rejoinValues, reformValue, remoldValue
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const TEXT_NATIVES = {
  print: printValue("\n"),
  prin: printValue(""),
  probe: probeValue,
  mold: giveText(moldValue),
  form: giveText(formValue),
  join: joinValues,
  rejoin: rejoinValues,
  reform: reformValue,
  remold: remoldValue,
};
