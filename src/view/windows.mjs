/** @import { Datum, Store } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { GLOBAL, UNSET, makeSeries, readContext, writeContext, writeWord } from "../store/store.mjs";
import { askEdge, giveValue, makeMachine } from "../machine/machine.mjs";
import { runMachine } from "../machine/run.mjs";
import { exportElement } from "./elements.mjs";
import { formatError } from "../natives/report.mjs";

const RENDER_BUDGET = 2000;
const HANDLER_BUDGET = 5000;
const SCREEN = { class: "wr-screen", style: "position:relative" };

/**
 * @usedby openWindow, closeWindow
 */
const markChange = (store, windows) => ({ ...store, windows, dirty: true });

/**
 * @uses markChange, giveValue (src/machine/machine.mjs), askEdge (src/machine/machine.mjs)
 * @usedby WINDOW_NATIVES
 */
const openWindow = (machine, [face], options) => {
  // The face becomes a window of the session. Without /new, the script waits until the windows are closed.
  const store = markChange(machine.store, [...(machine.store.windows ?? []), face]);
  const opened = giveValue({ ...machine, store }, face);
  return options.$new === undefined ? askEdge(opened, { kind: "events", resume: (waiting) => waiting }) : opened;
};

/**
 * @uses giveValue (src/machine/machine.mjs), markChange, UNSET (src/store/store.mjs)
 * @usedby WINDOW_NATIVES
 */
const closeWindow = (machine, args, options) => {
  // Without a refinement, the last window closes. With /all, all windows close.
  const windows = machine.store.windows ?? [];
  const kept = options.$all === undefined ? windows.slice(0, -1) : [];
  return giveValue({ ...machine, store: markChange(machine.store, kept) }, UNSET);
};

/**
 * @uses giveValue (src/machine/machine.mjs)
 * @usedby WINDOW_NATIVES
 */
const showFace = (machine, [face]) =>
  // The page draws at the next animation frame. This word only tells the page that a face changed.
  giveValue({ ...machine, store: { ...machine.store, dirty: true } }, face);

/**
 * Makes the element data of all the windows of a session, in the format of Plastron.
 * @param {Store} store
 * @returns {{ tag: string, props: object, children: object[] }}
 * @standard windows - Each window is one child of the screen element.
 * @keypoint The elements are made by the REBOL function face-to-element. A script can replace it, or change the object theme.
 * @uses makeSeries (src/store/store.mjs), GLOBAL (src/store/store.mjs), runMachine (src/machine/run.mjs),
 *   makeMachine (src/machine/machine.mjs), RENDER_BUDGET, exportElement, SCREEN
 * @usedby paint (src/edge/page.mjs)
 */
export const renderWindows = (store) => {
  const renderFace = (face) => {
    // Evaluate "face-to-element <face>" in a machine of its own. The store of that machine is not kept.
    const call = makeSeries(store, "block", [{ type: "word", value: "face-to-element", bind: GLOBAL }, face]);
    const done = runMachine(makeMachine(call.store, call.value), RENDER_BUDGET);
    // An error in the REBOL function shows as a text in the position of the window.
    if (done.thrown !== null || done.mode !== "done") return { text: `WebRebol cannot draw this window: ${done.thrown?.value.value ?? "the render did not end"}` };
    return exportElement(done.store, done.value);
  };
  return { tag: "div", props: SCREEN, children: (store.windows ?? []).map(renderFace) };
};

/**
 * Evaluates the action block of a face after an event of the page.
 * @param {Store} store
 * @param {number} block - The series number of the action block.
 * @returns {Store}
 * @standard dirty - After the action, the page draws the windows again.
 * @standard fault - An error in the action adds its message to the printed text.
 * @uses runMachine (src/machine/run.mjs), makeMachine (src/machine/machine.mjs), makeDatum (src/data/datum.mjs),
 *   HANDLER_BUDGET, formatError (src/natives/report.mjs)
 * @usedby runTimers (src/edge/page.mjs), readEvent (src/edge/page.mjs), runKeyAction, runPointerAction, runEngage
 */
export const runAction = (store, block) => {
  const done = runMachine(makeMachine(store, makeDatum("block", { id: block, index: 0 })), HANDLER_BUDGET);
  // An error in the action shows in the printed text of the session.
  const fault = done.thrown?.kind === "error" ? `${formatError(done.store, done.thrown.value)}\n` : "";
  return { ...done.store, output: done.store.output + fault, dirty: true };
};

/**
 * @usedby listTimers, listKeyBlocks, listEngageTimers
 */
const findProps = (name) => (node) =>
  // Find each element of a tree that has an attribute, and the elements below it.
  node.tag === undefined ? [] : [...(node.props[name] === undefined ? [] : [node.props]), ...node.children.flatMap(findProps(name))];

/**
 * Lists the timers of a view: the action block and the rate of each element that has a timer.
 * @param {{ tag?: string, props?: object, children?: object[] }} view - The element data of the page.
 * @returns {{ block: number, rate: number }[]}
 * @standard rate - The rate is the number of events for each second.
 * @uses findProps
 * @usedby runTimers (src/edge/page.mjs)
 */
export const listTimers = (view) =>
  findProps("data-ontime")(view).map((props) => ({ block: Number(props["data-ontime"]), rate: Number(props["data-rate"]) }));

/**
 * Lists the action blocks of a view that want the keys of the keyboard.
 * @param {{ tag?: string, props?: object, children?: object[] }} view - The element data of the page.
 * @returns {number[]}
 * @uses findProps
 * @usedby readKey (src/edge/page.mjs)
 */
export const listKeyBlocks = (view) => findProps("data-onkey")(view).map((props) => Number(props["data-onkey"]));

/**
 * Evaluates the key block of a face. The global word `key` has the name of the key, for example "ArrowLeft" or "a".
 * @param {Store} store
 * @param {number} block - The series number of the key block.
 * @param {string} name - The name of the key.
 * @returns {Store}
 * @standard word - The block reads the name of the key from the word `key`.
 * @uses makeSeries (src/store/store.mjs), runAction, writeWord (src/store/store.mjs), GLOBAL (src/store/store.mjs)
 * @usedby readKey (src/edge/page.mjs)
 */
export const runKeyAction = (store, block, name) => {
  const made = makeSeries(store, "string", name);
  return runAction(writeWord(made.store, { type: "word", value: "key", bind: GLOBAL }, made.value), block);
};

/**
 * Evaluates the pointer block of a face. The global word `pointer` has the position of the pointer in the face, as a pair.
 * @param {Store} store
 * @param {number} block - The series number of the pointer block.
 * @param {number[]} position - The x and y of the pointer, from the top left corner of the face.
 * @returns {Store}
 * @standard word - The block reads the position from the word `pointer`.
 * @uses runAction, writeWord (src/store/store.mjs), GLOBAL (src/store/store.mjs), makeDatum (src/data/datum.mjs)
 * @usedby readPointer (src/edge/page.mjs)
 */
export const runPointerAction = (store, block, position) =>
  runAction(writeWord(store, { type: "word", value: "pointer", bind: GLOBAL }, makeDatum("pair", position.map(Math.round))), block);

/**
 * Calls the engage function of the feel of a face, as REBOL View does for an event.
 * @param {Store} store
 * @param {number} context - The context number of the face.
 * @param {{ kind: string, offset: number[], key?: string }} event - The action word, the position in the face, and the key.
 * @returns {Store}
 * @standard arguments - The function gets the face, the action as a word, and an event value.
 * @uses readContext (src/store/store.mjs), makeDatum (src/data/datum.mjs), makeSeries (src/store/store.mjs),
 *   runAction
 * @usedby runTimers (src/edge/page.mjs), readPointer (src/edge/page.mjs)
 */
export const runEngage = (store, context, event) => {
  const face = readContext(store, context);
  const feel = face?.$feel?.type === "object" ? readContext(store, face.$feel.value.context) : undefined;
  if (feel?.$engage === undefined) return store;
  const value = makeDatum("event", { ...event, offset: event.offset.map(Math.round), face: face.$self });
  const call = makeSeries(store, "block", [feel.$engage, face.$self, makeDatum("lit-word", event.kind), value]);
  return runAction(call.store, call.value.value.id);
};

/**
 * Lists the faces of a view that have a feel and a rate: the context number of the face and the rate.
 * @param {{ tag?: string, props?: object, children?: object[] }} view - The element data of the page.
 * @returns {{ face: number, rate: number }[]}
 * @uses findProps
 * @usedby runTimers (src/edge/page.mjs)
 */
export const listEngageTimers = (view) =>
  findProps("data-engage")(view)
    .filter((props) => props["data-rate"] !== undefined)
    .map((props) => ({ face: Number(props["data-engage"]), rate: Number(props["data-rate"]) }));

/**
 * Puts the text that a person typed into the face of a field.
 * @param {Store} store
 * @param {number} context - The context number of the face.
 * @param {string} text
 * @returns {Store}
 * @standard text - The field text of the face is a new string with the typed text.
 * @uses makeSeries (src/store/store.mjs), writeContext (src/store/store.mjs), readContext (src/store/store.mjs)
 * @usedby readEvent (src/edge/page.mjs)
 */
export const changeText = (store, context, text) => {
  const made = makeSeries(store, "string", text);
  return writeContext(made.store, context, { ...readContext(made.store, context), $text: made.value });
};

/**
 * The natives for the windows of View. Each entry has the name of REBOL and the function.
 * @uses openWindow, closeWindow, showFace
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const WINDOW_NATIVES = {
  view: openWindow,
  unview: closeWindow,
  show: showFace,
};
