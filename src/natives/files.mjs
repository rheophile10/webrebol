/** @import { Datum, Machine } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { loadSource } from "../data/load.mjs";
import { makeDate } from "../data/dates.mjs";
import { NONE, UNSET, allocate, isList, makeRecord, makeSeries, readRest } from "../store/store.mjs";
import { listFolder, makeFolder, removeEntry, renameEntry, resolvePath, writeFile } from "../store/disk.mjs";
import { formValue, moldRest, moldValue } from "../store/mold.mjs";
import { failMachine, giveValue, makeLogic, makeWord, startBlock } from "../machine/machine.mjs";
import { failSyntax } from "./control.mjs";
import { giveNew } from "./series.mjs";
import { readBytes } from "./digest.mjs";

const DAY_MILLISECONDS = 86400000;
const HEADER = /^\s*REBOL\s*\[/i;

/**
 * @uses resolvePath (src/store/disk.mjs), readRest (src/store/store.mjs)
 * @usedby 13 declarations in files
 */
const readPath = (machine, file) => resolvePath(machine.store.directory, readRest(machine.store, file));

/**
 * @uses readRest (src/store/store.mjs)
 * @usedby readSource, writeTarget, cleanPath
 */
const isFolderName = (machine, file) => readRest(machine.store, file).endsWith("/");

/**
 * @usedby readSource, readScript
 */
const makeText = (bytes) => bytes.map((byte) => String.fromCharCode(byte)).join("");

/**
 * @uses makeSeries (src/store/store.mjs), failMachine (src/machine/machine.mjs)
 * @usedby readSource, writeTarget, makeDirectory, doFile, loadFile
 */
const failAccess = (machine, id, path) => {
  // The field of the error is the full path, as a text.
  const made = makeSeries(machine.store, "string", path);
  return failMachine({ ...machine, store: made.store }, `access ${id}`, [made.value]);
};

/**
 * @uses makeSeries (src/store/store.mjs), giveNew
 * @usedby readSource
 */
const giveStrings = (machine, type, texts) => {
  const addText = (made, text) => {
    const next = makeSeries(made.store, type, text);
    return { store: next.store, values: [...made.values, next.value] };
  };
  const made = texts.reduce(addText, { store: machine.store, values: [] });
  return giveNew({ ...machine, store: made.store }, "block", made.values);
};

/**
 * @usedby readSource
 */
const readLines = (text) => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));

/**
 * @uses readPath, isFolderName, giveStrings, listFolder (src/store/disk.mjs), failAccess, giveNew, makeText,
 *   readLines
 * @usedby FILE_NATIVES
 */
const readSource = (machine, [source], options) => {
  // A folder gives the block of its names. A file gives its text, its bytes or its lines.
  const path = readPath(machine, source);
  const entry = machine.store.disk[path];
  if (entry?.kind === "folder" && isFolderName(machine, source)) return giveStrings(machine, "file", listFolder(machine.store.disk, path));
  if (entry?.kind !== "file" || isFolderName(machine, source)) return failAccess(machine, "cannot-open", `${path}${isFolderName(machine, source) ? "/" : ""}`);
  const bytes = options.$part === undefined ? entry.bytes : entry.bytes.slice(0, options.$part[0].value);
  if (options.$binary !== undefined) return giveNew(machine, "binary", bytes);
  return options.$lines === undefined ? giveNew(machine, "string", makeText(bytes)) : giveStrings(machine, "string", readLines(makeText(bytes)));
};

/**
 * @uses readBytes, isList (src/store/store.mjs), readRest (src/store/store.mjs), formValue (src/store/mold.mjs)
 * @usedby writeTarget
 */
const makeBytes = (machine, value, options) => {
  // With /lines, each item is a line. Without it, the items of a block are joined.
  if (value.type === "binary" || value.type === "string") {
    return [...readBytes(machine.store, value), ...(options.$lines === undefined ? [] : [10])];
  }
  const parts = isList(value) ? readRest(machine.store, value) : [value];
  const text = parts.map((part) => formValue(machine.store, part) + (options.$lines === undefined ? "" : "\n")).join("");
  return [...text].map((char) => char.charCodeAt(0) & 255);
};

/**
 * @uses readPath, isFolderName, failAccess, makeBytes, writeFile (src/store/disk.mjs),
 *   giveValue (src/machine/machine.mjs), UNSET (src/store/store.mjs)
 * @usedby saveValue, FILE_NATIVES
 */
const writeTarget = (machine, [target, value], options) => {
  const path = readPath(machine, target);
  if (isFolderName(machine, target)) return failAccess(machine, "no-make-dir", `${path}/`);
  const old = options.$append === undefined ? [] : (machine.store.disk[path]?.bytes ?? []);
  const file = { bytes: [...old, ...makeBytes(machine, value, options)], modified: machine.store.started };
  const disk = writeFile(machine.store.disk, path, file);
  return disk === null ? failAccess(machine, "cannot-open", path) : giveValue({ ...machine, store: { ...machine.store, disk } }, UNSET);
};

/**
 * @uses giveValue (src/machine/machine.mjs), makeLogic (src/machine/machine.mjs), readPath
 * @usedby FILE_NATIVES
 */
const testEntry = (test) => (machine, [target]) => giveValue(machine, makeLogic(test(machine.store.disk[readPath(machine, target)])));

/**
 * @uses DAY_MILLISECONDS, makeDatum (src/data/datum.mjs), makeDate (src/data/dates.mjs)
 * @usedby readInfo, FILE_NATIVES
 */
const makeMoment = (milliseconds) => {
  const days = Math.floor(milliseconds / DAY_MILLISECONDS);
  return makeDatum("date", makeDate(days, Math.floor((milliseconds - days * DAY_MILLISECONDS) / 1000) * 1e9, 0));
};

/**
 * @uses readPath, giveValue (src/machine/machine.mjs), NONE (src/store/store.mjs)
 * @usedby FILE_NATIVES
 */
const readFact = (read) => (machine, [target]) => {
  const entry = machine.store.disk[readPath(machine, target)];
  return giveValue(machine, entry === undefined ? NONE : read(entry));
};

/**
 * @uses readPath, giveValue (src/machine/machine.mjs), NONE (src/store/store.mjs),
 *   makeWord (src/machine/machine.mjs), makeDatum (src/data/datum.mjs), makeMoment, makeRecord (src/store/store.mjs)
 * @usedby FILE_NATIVES
 */
const readInfo = (machine, [target]) => {
  // The object has the size, the date, and the type of the entry.
  const entry = machine.store.disk[readPath(machine, target)];
  if (entry === undefined) return giveValue(machine, NONE);
  const type = makeWord(entry.kind === "folder" ? "directory" : "file");
  const values = [makeDatum("integer", entry.bytes?.length ?? 0), makeMoment(entry.modified ?? machine.store.started), type];
  const made = makeRecord(machine.store, ["size", "date", "type"], values);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses failMachine (src/machine/machine.mjs), giveValue (src/machine/machine.mjs), UNSET (src/store/store.mjs)
 * @usedby FILE_NATIVES
 */
const changeDisk = (change, id) => (machine, args, options) => {
  // The function gives the new disk, or null when the disk cannot change in this way.
  const disk = change(machine, args, options);
  if (disk === null) return failMachine(machine, `access ${id}`, [args[0]]);
  return giveValue({ ...machine, store: { ...machine.store, disk } }, id === "no-make-dir" ? args[0] : UNSET);
};

/**
 * @uses readPath, removeEntry (src/store/disk.mjs), giveValue (src/machine/machine.mjs), UNSET (src/store/store.mjs),
 *   failMachine (src/machine/machine.mjs), makeSeries (src/store/store.mjs), readRest (src/store/store.mjs)
 * @usedby FILE_NATIVES
 */
const deleteEntry = (machine, [target]) => {
  // REBOL names a folder that is not empty with a text, and a file that is not there with the file value.
  const path = readPath(machine, target);
  const disk = removeEntry(machine.store.disk, path, false);
  if (disk !== null) return giveValue({ ...machine, store: { ...machine.store, disk } }, UNSET);
  if (machine.store.disk[path] === undefined) return failMachine(machine, "access no-delete", [target]);
  const made = makeSeries(machine.store, "string", readRest(machine.store, target));
  return failMachine({ ...machine, store: made.store }, "access no-delete", [made.value]);
};

/**
 * @uses readPath, makeFolder (src/store/disk.mjs), failAccess, giveValue (src/machine/machine.mjs)
 * @usedby FILE_NATIVES
 */
const makeDirectory = (machine, [target], options) => {
  const path = readPath(machine, target);
  const disk = makeFolder(machine.store.disk, path, options.$deep !== undefined);
  return disk === null ? failAccess(machine, "no-make-dir", `${path}/`) : giveValue({ ...machine, store: { ...machine.store, disk } }, target);
};

/**
 * @uses readPath, makeSeries (src/store/store.mjs), failMachine (src/machine/machine.mjs), giveNew
 * @usedby FILE_NATIVES
 */
const changeDirectory = (machine, [target]) => {
  const path = readPath(machine, target);
  if (machine.store.disk[path]?.kind !== "folder") {
    const made = makeSeries(machine.store, "file", `${path}/`);
    return failMachine({ ...machine, store: made.store }, "access cannot-open", [made.value]);
  }
  return giveNew({ ...machine, store: { ...machine.store, directory: path === "/" ? "/" : `${path}/` } }, "file", path === "/" ? "/" : `${path}/`);
};

/**
 * @uses readPath, giveNew, isFolderName
 * @usedby FILE_NATIVES
 */
const cleanPath = (machine, [target]) => {
  const path = readPath(machine, target);
  return giveNew(machine, "file", isFolderName(machine, target) && path !== "/" ? `${path}/` : path);
};

/**
 * @uses loadSource (src/data/load.mjs), HEADER
 * @usedby readScript
 */
const dropHeader = (text) => {
  // A script file starts with the word REBOL and a block. The loader reads the values after them.
  const loaded = loadSource(text);
  if (loaded.type === "error" || !HEADER.test(text)) return loaded;
  return { ...loaded, value: loaded.value.slice(2) };
};

/**
 * @uses readPath, makeText, dropHeader
 * @usedby doFile, loadFile
 */
const readScript = (machine, target) => {
  const entry = machine.store.disk[readPath(machine, target)];
  return entry?.kind === "file" ? { text: makeText(entry.bytes), loaded: dropHeader(makeText(entry.bytes)) } : null;
};

/**
 * Evaluates a script file of the disk. The file must start with a REBOL header.
 * @param {Machine} machine
 * @param {Datum} target - The file value.
 * @returns {Machine}
 * @standard header - A file without a header gives the error "syntax header".
 * @uses readScript, failAccess, readPath, failSyntax, HEADER, failMachine (src/machine/machine.mjs),
 *   allocate (src/store/store.mjs), startBlock (src/machine/machine.mjs)
 * @usedby OVERRIDES
 */
export const doFile = (machine, target) => {
  const file = readScript(machine, target);
  if (file === null) return failAccess(machine, "cannot-open", readPath(machine, target));
  if (file.loaded.type === "error") return failSyntax(machine, file.loaded);
  if (!HEADER.test(file.text)) return failMachine(machine, "syntax header");
  const made = allocate(machine.store, file.loaded);
  return startBlock({ ...machine, store: made.store }, made.value);
};

/**
 * Loads the values of a file of the disk, without a REBOL header. One value gives the value itself.
 * @param {Machine} machine
 * @param {Datum} target - The file value.
 * @returns {Machine}
 * @standard single - A file with one value gives that value, not a block.
 * @uses readScript, failAccess, readPath, failSyntax, allocate (src/store/store.mjs), readRest (src/store/store.mjs),
 *   giveValue (src/machine/machine.mjs)
 * @usedby OVERRIDES
 */
export const loadFile = (machine, target) => {
  const file = readScript(machine, target);
  if (file === null) return failAccess(machine, "cannot-open", readPath(machine, target));
  if (file.loaded.type === "error") return failSyntax(machine, file.loaded);
  const made = allocate(machine.store, file.loaded);
  const items = readRest(made.store, made.value);
  return giveValue({ ...machine, store: made.store }, items.length === 1 ? items[0] : made.value);
};

/**
 * @uses moldRest (src/store/mold.mjs), moldValue (src/store/mold.mjs), makeSeries (src/store/store.mjs), writeTarget
 * @usedby FILE_NATIVES
 */
const saveValue = (machine, [target, value], options) => {
  // A block is saved without its brackets.
  const text = value.type === "block" ? moldRest(machine.store, value) : moldValue(machine.store, value);
  const made = makeSeries(machine.store, "string", text);
  return writeTarget({ ...machine, store: made.store }, [target, made.value], options);
};

/**
 * The natives for the files and the folders of the disk. Each entry has the name of REBOL and the function.
 * @uses readSource, writeTarget, saveValue, testEntry, readFact, makeDatum (src/data/datum.mjs), makeMoment,
 *   readInfo, deleteEntry, changeDisk, removeEntry (src/store/disk.mjs), readPath, renameEntry (src/store/disk.mjs),
 *   resolvePath (src/store/disk.mjs), readRest (src/store/store.mjs), makeDirectory, changeDirectory, giveNew,
 *   cleanPath
 * @usedby NATIVES
 */
export const FILE_NATIVES = {
  read: readSource,
  write: writeTarget,
  save: saveValue,
  "exists?": testEntry((entry) => entry !== undefined),
  "dir?": testEntry((entry) => entry?.kind === "folder"),
  "size?": readFact((entry) => makeDatum("integer", entry.bytes?.length ?? 0)),
  "modified?": (machine, args) => readFact((entry) => makeMoment(entry.modified ?? machine.store.started))(machine, args),
  "info?": readInfo,
  delete: deleteEntry,
  "delete-dir": changeDisk((machine, [target]) => removeEntry(machine.store.disk, readPath(machine, target), true), "no-delete"),
  rename: changeDisk((machine, [from, target]) => renameEntry(machine.store.disk, readPath(machine, from), resolvePath(readPath(machine, from).replace(/[^/]*$/, ""), readRest(machine.store, target))), "no-rename"),
  "make-dir": makeDirectory,
  "change-dir": changeDirectory,
  "what-dir": (machine) => giveNew(machine, "file", machine.store.directory),
  "clean-path": cleanPath,
  "to-local-file": (machine, [target]) => giveNew(machine, "string", readRest(machine.store, target)),
  "to-rebol-file": (machine, [target]) => giveNew(machine, "file", readRest(machine.store, target)),
};
