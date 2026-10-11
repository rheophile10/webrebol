// The page of WebRebol: it runs a machine in steps, draws the windows on each animation frame, and gives events to the machine.
import { answerRequest } from "../machine/machine.mjs";
import { runMachine } from "../machine/run.mjs";
import { showResult, startSource } from "../session/interpret.mjs";
import { findError, formatError } from "../natives/report.mjs";
import { changeText, listKeyBlocks, listTimers, renderWindows, runAction, runKeyAction } from "../view/windows.mjs";
import { diff } from "../view/diff.mjs";
import { applyPatches } from "./dom.mjs";
import { performRequest } from "./drive.mjs";

const BATCHES = 50;
const EVENT_TYPES = ["click", "input"];
const DEMO = `lay: layout [
    h2 "WebRebol"
    text "Type a name, then push the button."
    name: field "world"
    across
    button "Greet" [message/text: join "Hello, " name/text show message]
    button "Close" css [background-color 150.40.40] [unview]
    return
    message: text 200 "..."
]
view lay`;

/** The one place that holds the running state of the page. */
const state = new Map();

/**
 * @usedby paint, frame, start, boot
 */
const findPart = (id) => document.getElementById(id);

/**
 * @uses findError (src/natives/report.mjs), showResult (src/session/interpret.mjs),
 *   formatError (src/natives/report.mjs)
 * @usedby frame
 */
const showEnd = (machine) => {
  // Show the printed text. At the end, show the result or the error.
  const fault = machine.mode === "done" ? findError(machine) : null;
  const end = fault === null ? `== ${showResult(machine)}` : formatError(machine.store, fault);
  return `${machine.store.output}${machine.mode === "done" ? end : ""}`;
};

/**
 * @uses state, renderWindows (src/view/windows.mjs), applyPatches, findPart, diff (src/view/diff.mjs)
 * @usedby frame
 */
const paint = () => {
  // Draw only when a face changed. Compare the new elements with the last elements and change the DOM.
  const machine = state.get("machine");
  if (machine === undefined || (!machine.store.dirty && state.has("view"))) return;
  const view = renderWindows(machine.store);
  applyPatches(findPart("screen"), diff(state.get("view"), view, [0]));
  state.set("view", view);
  state.set("machine", { ...machine, store: { ...machine.store, dirty: false } });
};

/**
 * @uses state, answerRequest (src/machine/machine.mjs), performRequest
 * @usedby advance
 */
const serveRequest = (machine) => {
  // A script that waits in `view` continues when all the windows are closed. Other requests are work for the edge.
  if (machine.request.kind === "events") {
    return machine.store.windows.length === 0 ? state.set("machine", answerRequest(machine, null)) : state;
  }
  if (state.get("busy") === true) return state;
  state.set("busy", true);
  return performRequest(machine.request).then((answer) => {
    state.set("machine", answerRequest(state.get("machine"), answer));
    state.set("busy", false);
  });
};

/**
 * @uses state, serveRequest, runMachine (src/machine/run.mjs), BATCHES
 * @usedby frame
 */
const advance = () => {
  const machine = state.get("machine");
  if (machine === undefined || machine.mode === "done") return state;
  return machine.mode === "wait" ? serveRequest(machine) : state.set("machine", runMachine(machine, BATCHES));
};

/**
 * @usedby runTimers, readKey
 */
const isIdle = (machine) => machine !== undefined && ["wait", "done"].includes(machine.mode);

/**
 * @uses state, isIdle, listTimers (src/view/windows.mjs), runAction (src/view/windows.mjs)
 * @usedby frame
 */
const runTimers = (now) => {
  // A timer runs its block when its period is over. The page keeps the time of the last run of each block.
  const machine = state.get("machine");
  if (!isIdle(machine) || !state.has("view")) return;
  const last = state.get("ticks") ?? new Map();
  const due = listTimers(state.get("view")).filter((timer) => now - (last.get(timer.block) ?? 0) >= 1000 / timer.rate);
  due.forEach((timer) => last.set(timer.block, now));
  state.set("ticks", last);
  state.set("machine", { ...machine, store: due.reduce((store, timer) => runAction(store, timer.block), machine.store) });
};

/**
 * @uses state, isIdle, listKeyBlocks (src/view/windows.mjs), runKeyAction (src/view/windows.mjs)
 * @usedby boot
 */
const readKey = (event) => {
  // A key goes to each face that has a key block. The arrow keys and the space key do not scroll the page.
  const machine = state.get("machine");
  const blocks = isIdle(machine) && state.has("view") ? listKeyBlocks(state.get("view")) : [];
  if (blocks.length === 0 || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  event.preventDefault();
  state.set("machine", { ...machine, store: blocks.reduce((store, block) => runKeyAction(store, block, event.key), machine.store) });
};

/**
 * @uses advance, runTimers, paint, state, showEnd, findPart
 * @usedby boot
 */
const frame = (now) => {
  advance();
  runTimers(now);
  paint();
  const machine = state.get("machine");
  const text = machine === undefined ? "" : showEnd(machine);
  if (findPart("output").textContent !== text) findPart("output").replaceChildren(document.createTextNode(text));
  requestAnimationFrame(frame);
};

/**
 * @uses state, changeText (src/view/windows.mjs), runAction (src/view/windows.mjs)
 * @usedby boot
 */
const readEvent = (event) => {
  // An event goes to the machine only when the script waits or is done. The handler is on the element or above it.
  const machine = state.get("machine");
  const target = event.target instanceof Element ? event.target.closest(`[data-on${event.type}]`) : null;
  if (target === null || machine === undefined || !["wait", "done"].includes(machine.mode)) return;
  const handler = target.getAttribute(`data-on${event.type}`);
  const store =
    handler === "text"
      ? changeText(machine.store, Number(target.getAttribute("data-face")), target.value)
      : runAction(machine.store, Number(handler));
  state.set("machine", { ...machine, store });
};

/**
 * @uses state, findPart, startSource (src/session/interpret.mjs)
 * @usedby boot
 */
const start = () => {
  // Start a new session with the script of the text area. The time of the clock is the start time of the session.
  state.delete("view");
  findPart("screen").replaceChildren();
  state.set("machine", startSource(findPart("script").value, { started: Date.now(), seed: Date.now() | 0 }));
};

/**
 * @uses findPart, DEMO, readKey, start, EVENT_TYPES, readEvent, frame
 * @usedby src/edge/page.mjs
 */
const boot = () => {
  // The script comes from the address of the page, or from the text area of the page, or it is the demonstration.
  const given = new URLSearchParams(window.location.search).get("script");
  const written = findPart("script").value.trim();
  Reflect.set(findPart("script"), "value", given ?? (written === "" ? DEMO : written));
  document.addEventListener("keydown", readKey);
  findPart("run").addEventListener("click", start);
  EVENT_TYPES.forEach((type) => findPart("screen").addEventListener(type, readEvent));
  start();
  requestAnimationFrame(frame);
};

boot();
