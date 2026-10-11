/** @import { Datum, Store } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { GLOBAL, UNSET, makeSeries, readContext, writeContext } from "../store/store.mjs";
import { askEdge, giveValue, makeMachine } from "../machine/machine.mjs";
import { runMachine } from "../machine/run.mjs";
import { exportElement } from "./elements.mjs";

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
 * @uses runMachine (src/machine/run.mjs), makeMachine (src/machine/machine.mjs), makeDatum (src/data/datum.mjs),
 *   HANDLER_BUDGET
 * @usedby readEvent (src/edge/page.mjs)
 */
export const runAction = (store, block) => {
  const done = runMachine(makeMachine(store, makeDatum("block", { id: block, index: 0 })), HANDLER_BUDGET);
  return { ...done.store, dirty: true };
};

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
