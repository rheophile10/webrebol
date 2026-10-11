import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretSource, showResult } from "../src/session/interpret.mjs";
import { exportElement, writeMarkup } from "../src/view/elements.mjs";
import { drawCommands } from "../src/view/raster.mjs";
import { packPixel, unpackPixel } from "../src/data/pixels.mjs";
import { answerRequest } from "../src/machine/machine.mjs";
import { diff } from "../src/view/diff.mjs";
import { changeText, continueAction, endAction, listKeyBlocks, listTimers, renderWindows, runAction, runEngage, runKeyAction, runPointerAction } from "../src/view/windows.mjs";
import { findThreshold, hashCell, measureCenter, smoothNoise } from "../src/view/grid.mjs";
import { countItems, readContext, readRest, readWord, splitRows } from "../src/store/store.mjs";
import { readPixel, readRows, writePixel } from "../src/store/pictures.mjs";

const BATCHES = 2000;
const WINDOW = 'lay: layout [name: field "abc" button "Push" [print "pushed"] button "Close" [unview]] view/new lay';

/**
 * @uses interpretSource (src/session/interpret.mjs), BATCHES
 * @usedby readCommands
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

const GAME = 'lay: layout [ball: box 10x10 red rate 30 on-time [ball/offset: ball/offset + 2x1] on-key [last-key: key]] view/new lay';

test("listTimers rate: a face with a rate and a time block gives one timer", () => {
  const timers = listTimers(renderWindows(run(GAME).store));
  assert.equal(timers.length, 1);
  assert.equal(timers[0].rate, 30);
});

test("listTimers rate: the time block moves the face, and the next view has the new position", () => {
  const store = run(GAME).store;
  const moved = runAction(store, listTimers(renderWindows(store))[0].block);
  assert.match(renderWindows(moved).children[0].children[0].props.style, /left:22px;top:21px/);
});

test("runKeyAction word: the key block reads the name of the key from the word key", () => {
  const store = run(GAME).store;
  const after = runKeyAction(store, listKeyBlocks(renderWindows(store))[0], "ArrowLeft");
  assert.equal(showResult(interpretSource("1", 10)), "1");
  assert.equal(readRest(after, readWord(after, { type: "word", value: "last-key", bind: 0 })), "ArrowLeft");
});

test("runAction fault: an error in the action of a button adds its message to the printed text", () => {
  const store = run('lay: layout [button "Bad" [1 / 0]] view/new lay').store;
  const button = renderWindows(store).children[0].children[0];
  assert.match(runAction(store, Number(button.props["data-onclick"])).output, /^\*\* Math Error: .*\(math zero-divide\)\n$/);
});

const PAINT = "strokes: copy [] lay: layout [canvas: box 100x80 on-down [append strokes reduce ['pen 255.0.0 'line-width 3 'line pointer]] on-move [append strokes pointer]] canvas/effect: reduce ['draw strokes] view/new lay";

test("runPointerAction word: the pointer block reads the position from the word pointer", () => {
  const store = run(PAINT).store;
  const canvas = renderWindows(store).children[0].children[0];
  const down = runPointerAction(store, Number(canvas.props["data-onpointerdown"]), [10.4, 20.6]);
  const moved = runPointerAction(down, Number(canvas.props["data-onpointermove"]), [30, 40]);
  const line = renderWindows(moved).children[0].children[0].children[0].children[0];
  assert.equal(line.tag, "polyline");
  assert.equal(line.props.points, "10,21 30,40");
  assert.equal(line.props.stroke, "rgb(255,0,0)");
});

test("runEngage arguments: the engage function gets the face, the action word and the event", () => {
  const source = "seen: copy [] lay: layout [box 50x50 feel [engage: func [face action event] [append seen reduce [action event/offset face/size]]]] view/new lay";
  const store = run(source).store;
  const face = Number(renderWindows(store).children[0].children[0].props["data-engage"]);
  const after = runEngage(store, face, { kind: "down", offset: [3.2, 4.9] });
  assert.equal(showResult(interpretSource(`${source} seen`, BATCHES)), "[]");
  assert.equal(after.output, "");
  const seen = readRest(after, readWord(after, { type: "word", value: "seen", bind: 0 }));
  assert.deepEqual(seen.map((item) => item.value), ["down", [3, 5], [50, 50]]);
});

test("writeMarkup escape: the special characters of a text and of an attribute are entities", () => {
  const node = { tag: "p", props: { title: 'a "b" <c>' }, children: [{ text: "1 < 2 & 3" }] };
  assert.equal(writeMarkup(node), '<p title="a &quot;b&quot; &lt;c&gt;">1 &lt; 2 &amp; 3</p>');
});

test("writeMarkup namespace: only the top svg element gets the attribute xmlns", () => {
  const node = { tag: "svg", props: { width: "10" }, children: [{ tag: "svg", props: {}, children: [] }] };
  assert.equal(writeMarkup(node), '<svg xmlns="http://www.w3.org/2000/svg" width="10"><svg/></svg>');
});

/**
 * @uses packPixel (src/data/pixels.mjs)
 * @usedby makePicture
 */
const WHITE = packPixel([255, 255, 255, 0]);

/**
 * @uses WHITE
 */
const makePicture = (width, height) => ({ size: [width, height], rows: Array.from({ length: height }, () => Array.from({ length: width }, () => WHITE)) });

/**
 * @uses run, readRest (src/store/store.mjs)
 */
const readCommands = (source) => {
  const machine = run(source);
  return readRest(machine.store, machine.value);
};

test("drawCommands line: a line changes the pixels of its row and not the other rows", () => {
  const drawn = drawCommands(makePicture(6, 3), readCommands("[pen 255.0.0 line 0x1 5x1]"));
  assert.equal(drawn.rows[1][0], packPixel([255, 0, 0, 0]));
  assert.equal(drawn.rows[1][5], packPixel([255, 0, 0, 0]));
  assert.equal(drawn.rows[0][0], WHITE);
  assert.equal(drawn.rows[2][5], WHITE);
});

test("drawCommands shared: a row that a line does not touch is the same array as before", () => {
  const picture = makePicture(6, 3);
  const drawn = drawCommands(picture, readCommands("[pen 255.0.0 line 0x1 5x1]"));
  assert.equal(drawn.rows[0], picture.rows[0]);
  assert.equal(drawn.rows[2], picture.rows[2]);
  assert.notEqual(drawn.rows[1], picture.rows[1]);
});

test("drawCommands flood: a flood fills one side of a line and not the other side", () => {
  const lined = drawCommands(makePicture(6, 5), readCommands("[pen 0.0.0 line 0x2 5x2]"));
  const filled = drawCommands(lined, readCommands("[pen 0.255.0 flood 3x0]"));
  assert.equal(filled.rows[0][0], packPixel([0, 255, 0, 0]));
  assert.equal(filled.rows[1][5], packPixel([0, 255, 0, 0]));
  assert.equal(filled.rows[2][0], packPixel([0, 0, 0, 0]));
  assert.equal(filled.rows[4][5], WHITE);
  assert.equal(filled.rows[4], lined.rows[4]);
});

/**
 * @uses run, readRows (src/store/pictures.mjs)
 */
test("readRows shared: after a poke, a row without the pixel is the same array as before", () => {
  const machine = run("make image! [4x3 255.255.255]");
  const before = readRows(machine.store, machine.value);
  const after = readRows(writePixel(machine.store, machine.value, { place: 5, color: [1, 2, 3] }), machine.value);
  assert.equal(after[0], before[0]);
  assert.equal(after[2], before[2]);
});

test("writePixel row: a change at position 5 of a 4x3 image changes the second pixel of the second row", () => {
  const machine = run("make image! [4x3 255.255.255]");
  const rows = readRows(writePixel(machine.store, machine.value, { place: 5, color: [1, 2, 3] }), machine.value);
  assert.equal(rows[1][1], packPixel([1, 2, 3, 0]));
  assert.equal(rows[1][0], WHITE);
  assert.equal(rows.length, 3);
});

test("readPixel outside: a position after the last pixel gives null", () => {
  const machine = run("make image! [2x2 9.8.7]");
  assert.equal(readPixel(machine.store, machine.value, 4), null);
  assert.deepEqual(readPixel(machine.store, machine.value, 3).value, [9, 8, 7, 0]);
});

test("splitRows rows: five pixels with the width 2 give two full rows and one short row", () => {
  assert.deepEqual(splitRows([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("countItems image: an image of 4x3 has 12 items", () => {
  const machine = run("make image! [4x3 255.255.255]");
  assert.equal(countItems(machine.store, machine.value), 12);
});

test("endAction paused: an action that waits for the page gives a store that holds the waiting machine", () => {
  const store = run('lay: layout [button "Save" [download-image lay "pic.png" print "saved"]] view/new lay').store;
  const button = renderWindows(store).children[0].children[0];
  const waiting = runAction(store, Number(button.props["data-onclick"]));
  assert.equal(waiting.paused.request.kind, "download");
  assert.equal(waiting.paused.request.name, "pic.png");
  assert.equal(endAction(run("1")).paused, null);
});

test("continueAction resume: the action continues to its end after the answer of the page", () => {
  const store = run('lay: layout [button "Save" [download-image lay "pic.png" print "saved"]] view/new lay').store;
  const button = renderWindows(store).children[0].children[0];
  const done = continueAction(runAction(store, Number(button.props["data-onclick"])), null);
  assert.equal(done.output, "saved\n");
  assert.equal(done.paused, null);
  assert.equal(typeof answerRequest, "function");
});

test("packPixel alpha: the REBOL alpha 0 gives the alpha byte 255 of a canvas", () => {
  assert.equal(packPixel([255, 255, 255, 0]), -1);
  assert.equal(packPixel([1, 0, 0, 255]), 1);
});

test("unpackPixel inverse: the bytes of a packed color are the same bytes", () => {
  assert.deepEqual(unpackPixel(packPixel([10, 200, 30, 40])), [10, 200, 30, 40]);
  assert.deepEqual(unpackPixel(packPixel([255, 255, 255])), [255, 255, 255, 0]);
});

test("countItems image: foreach on an image of 3x2 gives one tuple for each pixel", () => {
  assert.equal(showResult(run("p: make image! [3x2 255.0.0] poke p 2 0.9.0 n: 0 foreach x p [if x/1 > 200 [n: n + 1]] n")), "5");
});
