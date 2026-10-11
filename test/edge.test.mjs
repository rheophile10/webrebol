import { test } from "node:test";
import assert from "node:assert/strict";
import { askEdge, answerRequest } from "../src/machine/machine.mjs";
import { runMachine } from "../src/machine/run.mjs";
import { showResult, startSource } from "../src/natives/interpret.mjs";
import { countCrc, hashMd5 } from "../src/natives/digest.mjs";
import { driveMachine, interpretWithEdge } from "../src/edge/drive.mjs";
import { readGolden } from "./golden.edge.mjs";

const BATCHES = 100;

/**
 * @uses interpretWithEdge (src/edge/drive.mjs), BATCHES, showResult (src/natives/interpret.mjs)
 * @usedby findProblems
 */
const showRun = async (source) => {
  // Show the result and the printed text in the same form as the recorded case.
  const machine = await interpretWithEdge(source, BATCHES);
  return `${showResult(machine)} | ${machine.store.output}`;
};

/**
 * @uses readGolden, showRun
 */
const findProblems = async (name) => {
  const entries = readGolden(name);
  const shown = await Promise.all(entries.map((entry) => showRun(entry.source)));
  return entries
    .map((entry, place) => `${entry.source} gives ${shown[place]}, not ${entry.expected} | ${entry.output}`)
    .filter((text, place) => shown[place] !== `${entries[place].expected} | ${entries[place].output}`);
};

test("interpretWithEdge reference: the checksum and clock cases agree with REBOL 2.7.8", async () => {
  assert.deepEqual(await findProblems("do/edge.txt"), []);
});

test("driveMachine answer: a machine that waits for a digest continues with the bytes", async () => {
  const machine = await driveMachine(startSource('checksum/secure "abc"'), BATCHES);
  assert.equal(showResult(machine), "#{A9993E364706816ABA3E25717850C26C9CD0D89D}");
});

test("askEdge wait: the machine gets the mode wait", () => {
  assert.equal(askEdge(startSource("1"), { kind: "clock" }).mode, "wait");
});

test("answerRequest resume: the function of the request gets the answer", () => {
  const waiting = askEdge(startSource("1"), { kind: "clock", resume: (machine, answer) => ({ ...machine, got: answer }) });
  assert.equal(answerRequest(waiting, 42).got, 42);
});

test("runMachine wait: a machine that waits for the clock stops", () => {
  assert.equal(runMachine(startSource("now"), BATCHES).mode, "wait");
});

test("startSource syntax: a block without its end gives a machine that throws", () => {
  assert.equal(startSource("[1").thrown.value.value, "syntax missing");
});

test("countCrc reference: the bytes of abc give 1664899", () => {
  assert.equal(countCrc([97, 98, 99]), 1664899);
});

test("hashMd5 reference: the bytes of abc give the standard digest", () => {
  const hex = hashMd5([97, 98, 99]).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  assert.equal(hex, "900150983cd24fb0d6963f7d28e17f72");
});
