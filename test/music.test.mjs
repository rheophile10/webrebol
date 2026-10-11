import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretSource, showResult } from "../src/session/interpret.mjs";
import { exportElement } from "../src/view/elements.mjs";
import { renderWindows } from "../src/view/windows.mjs";
import { readBytes } from "../src/natives/series.mjs";
import { readRest } from "../src/store/store.mjs";
import { readGolden } from "./golden.edge.mjs";

const BATCHES = 2000;
const WINDOW = "lay: layout [player: box 10x10] view/new lay ";

/**
 * @uses interpretSource (src/session/interpret.mjs), BATCHES, showResult (src/session/interpret.mjs)
 * @usedby findProblems
 */
const showRun = (source) => {
  // Show the result and the printed text in the same form as the recorded case.
  const machine = interpretSource(source, BATCHES);
  return `${showResult(machine)} | ${machine.store.output}`;
};

/**
 * @uses readGolden, showRun
 */
const findProblems = (name) =>
  readGolden(name)
    .filter((entry) => showRun(entry.source) !== `${entry.expected} | ${entry.output}`)
    .map((entry) => `${entry.source} gives ${showRun(entry.source)}, not ${entry.expected} | ${entry.output}`);

/**
 * @uses renderWindows (src/view/windows.mjs), interpretSource (src/session/interpret.mjs), WINDOW, BATCHES
 */
const listSounds = (source) => renderWindows(interpretSource(WINDOW + source, BATCHES).store).children[0].children[0].children[0];

test("interpretSource reference: the ABC cases of the music words agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("music/abc.txt"), []);
});

test("interpretSource reference: the sound cases of the music words agree with REBOL 2.7.8", () => {
  assert.deepEqual(findProblems("music/sound.txt"), []);
});

test("exportElement style: sound-element gives an audio element that plays a WAV file from a data address", () => {
  const machine = interpretSource("sound-element make-wav #{8080}", BATCHES);
  const sound = exportElement(machine.store, machine.value);
  assert.equal(sound.tag, "audio");
  assert.equal(sound.props.autoplay, true);
  assert.match(sound.props.src, /^data:audio\/wav;base64,UklGR/);
});

test("renderWindows windows: play-abc gives the face one audio element for each layer of notes", () => {
  const sounds = listSounds("play-abc player {K:C^/C [EG]}");
  assert.equal(sounds.key, "music-1");
  assert.deepEqual(sounds.children.map((child) => child.tag), ["audio", "audio"]);
});

test("renderWindows windows: a second play-score gives a new key, thus the page starts new audio elements", () => {
  const sounds = listSounds("score: abc-to-score {K:C^/C} play-score player score play-score/with player score [square 1 1]");
  assert.equal(sounds.key, "music-2");
  assert.equal(sounds.children.length, 1);
});

test("readBytes bytes: a binary gives its bytes, and a different value gives the character codes of its formed text", () => {
  const machine = interpretSource('reduce [#{01FF} "AB" 65]', BATCHES);
  const parts = readRest(machine.store, machine.value);
  assert.deepEqual(parts.map((part) => readBytes(machine.store, part)), [[1, 255], [65, 66], [54, 53]]);
});
