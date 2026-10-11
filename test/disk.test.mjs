import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestFolder, readTestFile, removeTestFolder } from "./folder.edge.mjs";
import { EMPTY_DISK, listFolder, makeFolder, removeEntry, renameEntry, resolvePath, writeFile } from "../src/store/disk.mjs";
import { EMPTY_TABLE, readEntry, writeEntry } from "../src/store/table.mjs";
import { readFolder, writeFolder } from "../src/edge/folder.mjs";
import { doFile, loadFile } from "../src/natives/files.mjs";
import { nextRandom } from "../src/natives/random.mjs";
import { showResult, startSource } from "../src/natives/interpret.mjs";
import { runMachine } from "../src/machine/run.mjs";

const FILE = { bytes: [104, 105], modified: 0 };
const BATCHES = 100;

/**
 * @uses writeFile (src/store/disk.mjs), EMPTY_DISK (src/store/disk.mjs), runMachine (src/machine/run.mjs),
 *   startSource (src/natives/interpret.mjs), BATCHES
 */
const makeScript = (text) => {
  // Make a machine that has one script file on its disk, and the file value for it.
  const disk = writeFile(EMPTY_DISK, "/script.r", { bytes: [...text].map((char) => char.charCodeAt(0)), modified: 0 });
  const machine = runMachine(startSource("%script.r", { disk }), BATCHES);
  return { machine: { ...machine, mode: "give" }, target: machine.value };
};

test("resolvePath clean: a path with points and a slash at its end becomes a plain full path", () => {
  assert.equal(resolvePath("/a/", "b/../c/./d/"), "/a/c/d");
  assert.equal(resolvePath("/a/", "/"), "/");
  assert.equal(resolvePath("/", "../.."), "/");
});

test("writeFile parent: a file in a folder that is not there gives null", () => {
  assert.equal(writeFile(EMPTY_DISK, "/none/a.txt", FILE), null);
  assert.equal(writeFile(EMPTY_DISK, "/a.txt", FILE)["/a.txt"].kind, "file");
});

test("makeFolder parent: a deep folder needs the deep option", () => {
  assert.equal(makeFolder(EMPTY_DISK, "/a/b", false), null);
  assert.equal(makeFolder(EMPTY_DISK, "/a/b", true)["/a"].kind, "folder");
});

test("listFolder direct: the list has only the direct entries, in the sequence of the alphabet", () => {
  const disk = writeFile(writeFile(makeFolder(EMPTY_DISK, "/sub", false), "/sub/z.txt", FILE), "/b.txt", FILE);
  assert.deepEqual(listFolder(disk, "/"), ["b.txt", "sub/"]);
});

test("removeEntry full: a folder that is not empty stays without the deep option", () => {
  const disk = writeFile(makeFolder(EMPTY_DISK, "/sub", false), "/sub/z.txt", FILE);
  assert.equal(removeEntry(disk, "/sub", false), null);
  assert.deepEqual(Object.keys(removeEntry(disk, "/sub", true)), ["/"]);
  assert.equal(removeEntry(disk, "/none", false), null);
});

test("renameEntry absent: an entry that is not there gives null", () => {
  assert.equal(renameEntry(EMPTY_DISK, "/a.txt", "/b.txt"), null);
  assert.equal(renameEntry(writeFile(EMPTY_DISK, "/a.txt", FILE), "/a.txt", "/b.txt")["/b.txt"].kind, "file");
});

test("readFolder root: an empty folder of the computer gives a disk with only the root", () => {
  const root = makeTestFolder();
  assert.deepEqual(readFolder(root), { "/": { kind: "folder" } });
  removeTestFolder(root);
});

test("writeFolder changes: a new file goes to the folder, and a second write of the same disk writes nothing", () => {
  const root = makeTestFolder();
  const before = readFolder(root);
  const after = writeFile(makeFolder(before, "/sub", false), "/sub/a.txt", FILE);
  assert.deepEqual(writeFolder(root, before, after), ["/sub", "/sub/a.txt"]);
  assert.equal(readTestFile(`${root}/sub/a.txt`), "hi");
  assert.deepEqual(writeFolder(root, after, after), []);
  removeTestFolder(root);
});

test("doFile header: a script file without a header gives the error", () => {
  const script = makeScript("1 + 2");
  assert.equal(doFile(script.machine, script.target).thrown.value.value, "syntax header");
  const good = makeScript("REBOL [] 1 + 2");
  assert.equal(showResult(runMachine(doFile(good.machine, good.target), BATCHES)), "3");
});

test("loadFile single: a file with one value gives the value and not a block", () => {
  const script = makeScript("42");
  assert.equal(loadFile(script.machine, script.target).value.type, "integer");
});

test("nextRandom range: the value is in the range from 0 to 1, and the same seed gives the same value", () => {
  const first = nextRandom(12345);
  assert.ok(first.value >= 0 && first.value < 1);
  assert.deepEqual(nextRandom(12345), first);
  assert.notEqual(nextRandom(first.seed).value, first.value);
});

test("readEntry absent: a key without a value gives undefined", () => {
  assert.equal(readEntry(EMPTY_TABLE, 5), undefined);
  assert.equal(readEntry(EMPTY_TABLE, 100000), undefined);
});

test("writeEntry shared: the old table does not change, and a large key adds levels", () => {
  const small = writeEntry(EMPTY_TABLE, 5, "five");
  const large = writeEntry(small, 100000, "large");
  assert.equal(readEntry(small, 5), "five");
  assert.equal(readEntry(small, 100000), undefined);
  assert.equal(readEntry(large, 5), "five");
  assert.equal(readEntry(large, 100000), "large");
});
