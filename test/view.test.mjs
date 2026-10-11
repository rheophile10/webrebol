import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretSource, showResult } from "../src/session/interpret.mjs";
import { exportElement } from "../src/view/elements.mjs";
import { diff } from "../src/view/diff.mjs";
import { changeText, renderWindows, runAction } from "../src/view/windows.mjs";
import { findThreshold, hashCell, measureCenter, smoothNoise } from "../src/view/grid.mjs";
import { readContext, readRest } from "../src/store/store.mjs";

const BATCHES = 2000;
const WINDOW = 'lay: layout [name: field "abc" button "Push" [print "pushed"] button "Close" [unview]] view/new lay';

/**
 * @uses interpretSource (src/session/interpret.mjs), BATCHES
 */
const run = (source) => interpretSource(source, BATCHES);

test("exportElement text: a value that is not an element gives a text node", () => {
  const machine = run('"plain"');
  assert.deepEqual(exportElement(machine.store, machine.value), { text: "plain" });
});

test("exportElement key: the key attribute becomes the key of the element", () => {
  const machine = run(`element 'div [key "row1" id "main"] ["text"]`);
  assert.deepEqual(exportElement(machine.store, machine.value), { tag: "div", props: { id: "main" }, children: [{ text: "text" }], key: "row1" });
});

test("exportElement style: a style block gives pixels for a number and rgb for a tuple", () => {
  const machine = run(`element 'div [style [width 100 color 255.0.0 opacity 0.5 display "flex"]] []`);
  assert.equal(exportElement(machine.store, machine.value).props.style, "width:100px;color:rgb(255,0,0);opacity:0.5;display:flex");
});

test("renderWindows windows: a window with three faces gives a screen with one window and three children", () => {
  const view = renderWindows(run(WINDOW).store);
  assert.equal(view.children.length, 1);
  assert.deepEqual(view.children[0].children.map((child) => child.tag), ["input", "button", "button"]);
  assert.match(view.children[0].children[1].props.style, /left:20px;top:52px;width:100px;height:24px/);
});

test("renderWindows windows: a change of the theme object changes the element of a button", () => {
  const view = renderWindows(run(`theme/font-family: "Georgia" append theme/css [button [border-radius 6]] ${WINDOW}`).store);
  assert.match(view.children[0].children[1].props.style, /font-family:Georgia/);
  assert.match(view.children[0].children[1].props.style, /border-radius:6px/);
});

test("runAction dirty: the action of a button prints, and the action of the Close button removes the window", () => {
  const store = run(WINDOW).store;
  const buttons = renderWindows(store).children[0].children;
  const pushed = runAction(store, Number(buttons[1].props["data-onclick"]));
  assert.equal(pushed.output, "pushed\n");
  assert.equal(pushed.dirty, true);
  assert.equal(runAction(store, Number(buttons[2].props["data-onclick"])).windows.length, 0);
});

test("changeText text: the typed text is the new text of the face", () => {
  const store = run(WINDOW).store;
  const field = renderWindows(store).children[0].children[0];
  const changed = changeText(store, Number(field.props["data-face"]), "typed");
  assert.equal(readRest(changed, readContext(changed, Number(field.props["data-face"])).$text), "typed");
});

test("diff same: two equal views give no patch, and a new text gives one text patch", () => {
  const before = renderWindows(run(WINDOW).store);
  assert.deepEqual(diff(before, before, [0]), []);
  const after = renderWindows(run(WINDOW.replace("Push", "Pull")).store);
  assert.deepEqual(diff(before, after, [0]).map((patch) => patch.kind), ["text"]);
});

test("findThreshold range: each threshold of the matrix is between 0 and 1", () => {
  const all = Array.from({ length: 64 }, (unused, place) => findThreshold(place % 8, Math.floor(place / 8)));
  assert.ok(all.every((value) => value > 0 && value < 1));
  assert.equal(new Set(all).size, 64);
});

test("hashCell repeat: the same cell gives the same number", () => {
  assert.equal(hashCell(3, 7), hashCell(3, 7));
  assert.ok(hashCell(3, 7) >= 0 && hashCell(3, 7) < 1);
  assert.notEqual(hashCell(3, 7), hashCell(7, 3));
});

test("smoothNoise range: the noise is between 0 and 1", () => {
  assert.ok(smoothNoise(5, 9, 4) >= 0 && smoothNoise(5, 9, 4) <= 1);
});

test("measureCenter range: the distance is small at the center and almost 1 at a corner", () => {
  assert.ok(measureCenter({ column: 5, row: 5 }, { columns: 10, rows: 10 }) < 0.11);
  assert.ok(measureCenter({ column: 0, row: 0 }, { columns: 10, rows: 10 }) > 0.89);
});

test("interpretSource reference: the grid words give the numbers of the grid functions", () => {
  assert.equal(showResult(run("hash-cell 3x7")), showResult(run("hash-cell 3x7")));
  assert.equal(showResult(run("find-threshold 0x0")), "0.0078125");
});

/**
 * @usedby makeList
 */
const makeNode = (tag, key) => ({ tag, props: {}, children: [], key });

/**
 * @uses makeNode
 */
const makeList = (keys) => ({ tag: "ul", props: {}, children: keys.map((key) => makeNode("li", key)) });

test("diff replace: a different tag gives one replace patch", () => {
  const patches = diff({ tag: "div", props: {}, children: [] }, { tag: "span", props: {}, children: [] }, [0]);
  assert.deepEqual(patches.map((patch) => patch.kind), ["replace"]);
});

test("diff order: without keys, a shorter list gives a removal from the end", () => {
  const before = { tag: "ul", props: {}, children: [{ text: "a" }, { text: "b" }, { text: "c" }] };
  const after = { tag: "ul", props: {}, children: [{ text: "a" }] };
  assert.deepEqual(diff(before, after, [0]).map((patch) => patch.path), [[0, 2], [0, 1]]);
});

test("diff keyed: a child with a key that moves gives one move patch", () => {
  const patches = diff(makeList(["a", "b", "c"]), makeList(["c", "a", "b"]), [0]);
  assert.deepEqual(patches.map((patch) => patch.kind), ["move"]);
});

test("diff minimal: a list of four keys in the reverse sequence gives three moves", () => {
  const patches = diff(makeList(["a", "b", "c", "d"]), makeList(["d", "c", "b", "a"]), [0]);
  assert.equal(patches.filter((patch) => patch.kind === "move").length, 3);
});
