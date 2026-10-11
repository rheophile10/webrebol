/** @import { Datum, Machine } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { isList, isText, makeKey, NONE, readAll, readContext, readRest, readWord, writeAll, writeContext, writeWord } from "../store/store.mjs";
import { readField, writeField } from "../store/parts.mjs";
import { failMachine, giveValue, isFunction, popFrame, pushFrame } from "./machine.mjs";
import { startCall } from "./call.mjs";

/**
 * @uses readWord (src/store/store.mjs)
 * @usedby walkPart, stepSetPath
 */
const resolvePart = (store, part) => (part.type === "get-word" ? readWord(store, part) : part);

/**
 * @uses makeKey (src/store/store.mjs)
 * @usedby selectInList, findPlace
 */
const isSameWord = (part) => (item) =>
  typeof item.value === "string" && typeof part.value === "string" && makeKey(item.value) === makeKey(part.value);

/**
 * @uses NONE (src/store/store.mjs), isSameWord
 * @usedby selectPart
 */
const selectInList = (items, part) => {
  // A number selects by position. A word selects the value after the same word.
  if (part.type === "integer") return items[part.value - 1] ?? NONE;
  const place = items.findIndex(isSameWord(part));
  return place < 0 ? null : (items[place + 1] ?? NONE);
};

/**
 * @uses NONE (src/store/store.mjs), makeDatum (src/data/datum.mjs)
 * @usedby selectPart
 */
const selectInText = (text, part) => {
  const character = part.type === "integer" ? text[part.value - 1] : undefined;
  return character === undefined ? NONE : makeDatum("char", character.charCodeAt(0));
};

/**
 * @uses readContext (src/store/store.mjs), makeKey (src/store/store.mjs), isList (src/store/store.mjs), selectInList,
 *   readRest (src/store/store.mjs), isText (src/store/store.mjs), selectInText, readField (src/store/parts.mjs),
 *   NONE (src/store/store.mjs)
 * @usedby walkPart, stepSetPath
 */
const selectPart = (store, value, part) => {
  // Give null if the value has no part with this name.
  if (value.type === "object") return readContext(store, value.value.context)[makeKey(String(part.value))] ?? null;
  if (isList(value)) return selectInList(readRest(store, value), part);
  if (isText(value)) return selectInText(readRest(store, value), part);
  // A value that is not a series can have fields. A position without a field gives none.
  const field = readField(value, part);
  return field === null && part.type === "integer" ? NONE : (field ?? null);
};

/**
 * @uses makeKey (src/store/store.mjs), selectPart, resolvePart, isFunction
 * @usedby evaluatePath
 */
const walkPart = (store) => (state, part) => {
  // After a function, the other parts are the refinements of its call.
  if (state.value === null) return state;
  if (state.names !== null) return { ...state, names: [...state.names, makeKey(String(part.value))] };
  const found = selectPart(store, state.value, resolvePart(store, part));
  return { value: found, names: found !== null && isFunction(found) ? [] : null, label: String(part.value), part };
};

/**
 * Evaluates a path: each part selects in the value of the part before it. A function in the path starts a call.
 * @param {Machine} machine
 * @param {Datum} path
 * @returns {Machine}
 * @standard invalid - A part that the value does not have gives the error "script invalid-path".
 * @uses readRest (src/store/store.mjs), readWord (src/store/store.mjs), failMachine, isFunction, walkPart, giveValue,
 *   startCall
 * @usedby EVALUATORS
 */
export const evaluatePath = (machine, path) => {
  const [head, ...parts] = readRest(machine.store, path);
  const value = readWord(machine.store, head);
  if (value.type === "unset") return failMachine(machine, "script no-value", [{ ...head, type: "word" }]);
  const start = { value, names: isFunction(value) ? [] : null, label: String(head.value) };
  const walked = parts.reduce(walkPart(machine.store), start);
  if (walked.value === null) return failMachine(machine, "script invalid-path", [walked.part]);
  return walked.names === null ? giveValue(machine, walked.value) : startCall(machine, walked.value, { names: walked.names, label: walked.label });
};

/**
 * @usedby assignInSeries
 */
const replaceAt = (all, place, item) => all.slice(0, place).concat(item, all.slice(place + 1));

/**
 * @uses readContext (src/store/store.mjs), makeKey (src/store/store.mjs), writeContext (src/store/store.mjs)
 * @usedby assignPart
 */
const assignInObject = (store, object, change) => {
  const values = readContext(store, object.value.context);
  const key = makeKey(String(change.part.value));
  if (values[key] === undefined) return { error: "script invalid-path", args: [change.part] };
  return { store: writeContext(store, object.value.context, { ...values, [key]: change.value }) };
};

/**
 * @uses isList (src/store/store.mjs), readRest (src/store/store.mjs), isSameWord
 * @usedby assignInSeries
 */
const findPlace = (store, series, part) => {
  // Give the position in the full series, or a negative number if the part is not there.
  if (part.type === "integer") return series.value.index + part.value - 1;
  const place = isList(series) ? readRest(store, series).findIndex(isSameWord(part)) : -1;
  return place < 0 ? -1 : series.value.index + place + 1;
};

/**
 * @uses readAll (src/store/store.mjs), findPlace, isList (src/store/store.mjs), writeAll (src/store/store.mjs),
 *   replaceAt
 * @usedby assignPart
 */
const assignInSeries = (store, series, change) => {
  // A word that is not in the series is an invalid path. A number after the end is out of range.
  const all = readAll(store, series);
  const place = findPlace(store, series, change.part);
  if (place < 0 && change.part.type !== "integer") return { error: "script invalid-path", args: [change.part] };
  if (place < 0 || place >= all.length) return { error: "script out-of-range", args: [change.part] };
  const item = isList(series) ? [change.value] : String.fromCharCode(change.value.value);
  return { store: writeAll(store, series, replaceAt(all, place, item)) };
};

/**
 * @uses assignInObject, isList (src/store/store.mjs), isText (src/store/store.mjs), assignInSeries
 * @usedby stepSetPath
 */
const assignPart = (store, container, change) => {
  if (container.type === "object") return assignInObject(store, container, change);
  return isList(container) || isText(container) ? assignInSeries(store, container, change) : { error: "script invalid-path" };
};

/**
 * @uses readRest (src/store/store.mjs), selectPart, resolvePart, readWord (src/store/store.mjs), failMachine,
 *   popFrame, writeField (src/store/parts.mjs), writeWord (src/store/store.mjs), assignPart
 * @usedby startSetPath
 */
const stepSetPath = (machine, frame) => {
  // The parts before the last part select the container.
  const [head, ...parts] = readRest(machine.store, frame.path);
  const select = (current, part) =>
    current === null ? null : selectPart(machine.store, current, resolvePart(machine.store, part));
  const container = parts.slice(0, -1).reduce(select, readWord(machine.store, head));
  if (container === null) return failMachine(popFrame(machine), "script invalid-path");
  // A field of a value that is not a series changes the value of the word.
  const changed = parts.length === 1 ? writeField(container, resolvePart(machine.store, parts[0]), machine.value) : null;
  if (changed !== null) return { ...popFrame(machine), store: writeWord(machine.store, head, changed) };
  // The last part gets the value. The value is also the result.
  const change = { part: resolvePart(machine.store, parts[parts.length - 1]), value: machine.value };
  const made = assignPart(machine.store, container, change);
  if (made.error !== undefined) return failMachine(popFrame(machine), made.error, made.args);
  return { ...popFrame(machine), store: made.store };
};

/**
 * Starts the work of a set-path: the machine evaluates the next expression, then puts its value into the container.
 * @param {Machine} machine
 * @param {Datum} path
 * @returns {Machine}
 * @standard range - A number after the end of a series gives the error "script out-of-range".
 * @uses pushFrame, stepSetPath
 * @usedby EVALUATORS
 */
export const startSetPath = (machine, path) => ({ ...pushFrame(machine, { step: stepSetPath, path }), mode: "next" });
