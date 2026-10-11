import { makeDatum } from "../data/datum.mjs";
import { NONE, allocate, makeRecord, makeSeries, readContext, readRest, writeWord } from "../store/store.mjs";
import { giveValue, makeLogic, makeWord } from "../machine/machine.mjs";
import { COLORS, STYLES, measureText } from "./data.mjs";

const FACE_WORDS = [
  ...["type", "offset", "size", "span", "pane", "text", "color", "image", "effect", "data", "edge", "font", "para"],
  ...["feel", "saved-area", "rate", "show?", "options", "parent-face", "old-offset", "old-size", "line-list"],
  ...["changes", "face-flags", "action", "style", "css", "on-time", "on-key", "on-down", "on-move", "on-up"],
];
const KEYWORDS = ["across", "below", "return", "at", "pad", "space", "origin"];
const WITH_VALUE = ["at", "pad", "space", "origin"];
// The facets that WebRebol adds to VID. Each one takes the next value of the layout block.
const WEB_FACETS = ["css", "rate", "on-time", "on-key", "on-down", "on-move", "on-up"];
const TEXT_PADDING = 4;
const START = { origin: [20, 20], space: [8, 8], place: [20, 20], across: false, line: 0, extent: [0, 0], faces: [], pending: null, expect: null };

/**
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby placeFace, makeLayout, sizeText
 */
const makePair = (pair) => makeDatum("pair", pair);

/**
 * @uses NONE (src/store/store.mjs), makeDatum (src/data/datum.mjs)
 * @usedby placeFace, makeLayout
 */
const makeTuple = (parts) => (parts === null ? NONE : makeDatum("tuple", parts));

/**
 * @uses makeRecord (src/store/store.mjs)
 * @usedby makePart, makeFace
 */
const makeObject = (state, words, values) => {
  const made = makeRecord(state.store, words, values);
  return { ...state, store: made.store, made: made.value };
};

/**
 * @uses NONE (src/store/store.mjs), allocate (src/store/store.mjs), makeObject
 * @usedby makeFace
 */
const makePart = (state, items, words) => {
  // A style without this part gives none. The facts of a style are loader values, thus a block in them goes into the store.
  if (items === null) return { ...state, made: NONE };
  const addValue = (made, word, place) => {
    const next = items[place] === undefined ? { store: made.store, value: NONE } : allocate(made.store, items[place]);
    return { store: next.store, values: [...made.values, next.value] };
  };
  const made = words.reduce(addValue, { store: state.store, values: [] });
  return makeObject({ ...state, store: made.store }, words, made.values);
};

/**
 * @uses STYLES, measureText, TEXT_PADDING
 * @usedby placeFace
 */
const findSize = (pending) => {
  // A size of the facets is first. Then the size of the style. A part that is not there comes from the text.
  const style = STYLES[pending.style];
  const [width, height] = measureText(pending.text ?? style.text ?? "", style.font);
  const fixed = pending.size ?? style.size ?? [-1, -1];
  const auto = [width + TEXT_PADDING, height + TEXT_PADDING];
  const size = fixed.map((part, place) => (part < 0 ? auto[place] : part));
  return pending.width === null ? size : [pending.width, size[1]];
};

/**
 * @uses STYLES, makePart, NONE (src/store/store.mjs), makeSeries (src/store/store.mjs),
 *   makeLogic (src/machine/machine.mjs), makeObject, FACE_WORDS
 * @usedby placeFace, makeLayout
 */
const makeFace = (state, facets) => {
  // Make the objects for the edge, the font and the para, then the face.
  const style = STYLES[facets.style] ?? {};
  const edged = makePart(state, style.edge ?? null, ["size", "color", "effect"]);
  const fonted = makePart(edged, style.font?.items ?? null, ["size", "style", "color", "align", "valign"]);
  const paraed = makePart(fonted, style.para ?? null, ["origin", "margin"]);
  const text = facets.text === null ? { store: paraed.store, value: NONE } : makeSeries(paraed.store, "string", facets.text);
  const fields = { ...facets.fields, text: text.value, edge: edged.made, font: fonted.made, para: paraed.made, "show?": makeLogic(true) };
  return makeObject({ ...state, store: text.store }, FACE_WORDS, FACE_WORDS.map((word) => fields[word] ?? NONE));
};

/**
 * @uses findSize, STYLES, makeWord (src/machine/machine.mjs), makePair, makeTuple, NONE (src/store/store.mjs),
 *   makeFace, writeWord (src/store/store.mjs)
 * @usedby readWordItem, nameFace, makeLayout
 */
const placeFace = (state) => {
  // Put the face that waits at the position. Then move the position in the direction of the layout.
  const pending = state.pending;
  if (pending === null) return state;
  const size = findSize(pending);
  const color = pending.color ?? STYLES[pending.style].color;
  const fields = { type: makeWord("face"), offset: makePair(state.place), size: makePair(size), color: makeTuple(color), style: makeWord(pending.style), action: pending.action ?? NONE, css: pending.css ?? NONE, rate: pending.rate ?? NONE, "on-time": pending["on-time"] ?? NONE, "on-key": pending["on-key"] ?? NONE, "on-down": pending["on-down"] ?? NONE, "on-move": pending["on-move"] ?? NONE, "on-up": pending["on-up"] ?? NONE };
  const made = makeFace(state, { style: pending.style, text: pending.text ?? STYLES[pending.style].text, fields });
  const extent = state.extent.map((part, axis) => Math.max(part, state.place[axis] + size[axis]));
  const place = state.across ? [state.place[0] + size[0] + state.space[0], state.place[1]] : [state.place[0], state.place[1] + size[1] + state.space[1]];
  // A set-word before the style gives the face to that word.
  const store = pending.name === undefined ? made.store : writeWord(made.store, pending.name, made.made);
  return { ...made, store, faces: [...state.faces, made.made], extent, place, line: state.across ? Math.max(state.line, size[1]) : 0, pending: null };
};

/**
 * @usedby COMMANDS
 */
const startLine = (state) => ({ ...state, place: [state.origin[0], state.place[1] + state.line + state.space[1]], line: 0 });

/**
 * @uses startLine
 * @usedby readWordItem
 */
const COMMANDS = {
  across: (state) => ({ ...state, across: true }),
  below: (state) => ({ ...(state.across ? startLine(state) : state), across: false }),
  return: startLine,
};

/**
 * @usedby SETTERS
 */
const readPair = (value) => (Array.isArray(value.value) ? value.value : [value.value, value.value]);

/**
 * @usedby SETTERS
 */
const moveAlong = (state, value) => {
  // A number moves the position in the direction of the layout. A pair moves it in the two directions.
  const [across, down] = Array.isArray(value.value) ? value.value : [state.across ? value.value : 0, state.across ? 0 : value.value];
  return { ...state, place: [state.place[0] + across, state.place[1] + down] };
};

/**
 * @uses readPair, moveAlong
 * @usedby readItem
 */
const SETTERS = {
  "at": (state, value) => ({ ...state, place: readPair(value) }),
  pad: moveAlong,
  space: (state, value) => ({ ...state, space: readPair(value) }),
  origin: (state, value) => ({ ...state, origin: readPair(value), place: readPair(value) }),
};

/**
 * @uses WEB_FACETS, WITH_VALUE, placeFace, KEYWORDS, COMMANDS, STYLES, COLORS
 * @usedby readItem
 */
const readWordItem = (state, item) => {
  // A word is a command, a style, or a color.
  const name = item.value.toLowerCase();
  // A web facet has a value after it: CSS for this one face, a rate in events for each second, or the block of an event.
  if (WEB_FACETS.includes(name)) return { ...state, expect: name };
  if (WITH_VALUE.includes(name)) return { ...placeFace(state), expect: name };
  if (KEYWORDS.includes(name)) return COMMANDS[name](placeFace(state));
  if (STYLES[name] !== undefined) {
    const placed = placeFace(state);
    return { ...placed, name: undefined, pending: { style: name, text: null, size: null, width: null, color: null, name: placed.name } };
  }
  return COLORS[name] === undefined || state.pending === null ? state : { ...state, pending: { ...state.pending, color: COLORS[name] } };
};

/**
 * @uses readRest (src/store/store.mjs)
 * @usedby readItem
 */
const FACETS = {
  string: (pending, item, store) => ({ ...pending, text: readRest(store, item) }),
  pair: (pending, item) => ({ ...pending, size: item.value }),
  integer: (pending, item) => ({ ...pending, width: item.value }),
  tuple: (pending, item) => ({ ...pending, color: item.value }),
  block: (pending, item) => ({ ...pending, action: item }),
};

/**
 * @uses placeFace
 * @usedby readItem
 */
const nameFace = (state, word) => ({ ...placeFace(state), name: word });

/**
 * @uses nameFace, WEB_FACETS, SETTERS, readWordItem, FACETS
 * @usedby makeLayout
 */
const readItem = (state, item) => {
  if (item.type === "set-word") return nameFace(state, item);
  // A value after a command is the argument of the command. Other values are facets of the face that waits.
  if (WEB_FACETS.includes(state.expect)) {
    return { ...state, expect: null, pending: state.pending === null ? null : { ...state.pending, [state.expect]: item } };
  }
  if (state.expect !== null) return { ...SETTERS[state.expect](state, item), expect: null };
  if (item.type === "word") return readWordItem(state, item);
  const facet = FACETS[item.type];
  return facet === undefined || state.pending === null ? state : { ...state, pending: facet(state.pending, item, state.store) };
};

/**
 * @uses placeFace, readRest (src/store/store.mjs), readItem, START, makeSeries (src/store/store.mjs),
 *   makeWord (src/machine/machine.mjs), makePair, makeTuple, makeFace, giveValue (src/machine/machine.mjs)
 * @usedby VIEW_NATIVES
 */
const makeLayout = (machine, [specs]) => {
  // The size of the layout is the extent of its faces and the origin.
  const done = placeFace(readRest(machine.store, specs).reduce(readItem, { ...START, store: machine.store }));
  const pane = makeSeries(done.store, "block", done.faces);
  const size = done.extent.map((part, axis) => part + done.origin[axis]);
  const fields = { type: makeWord("face"), offset: makePair([50, 50]), size: makePair(size), color: makeTuple([200, 200, 200]), pane: pane.value };
  const made = makeFace({ ...done, store: pane.store }, { style: "face", text: null, fields });
  return giveValue({ ...machine, store: made.store }, made.made);
};

/**
 * @uses readContext (src/store/store.mjs), giveValue (src/machine/machine.mjs), NONE (src/store/store.mjs),
 *   readStyleWords, makePair, measureText, readRest (src/store/store.mjs)
 * @usedby VIEW_NATIVES
 */
const sizeText = (machine, [face]) => {
  // The result is none for a face without a text.
  const values = readContext(machine.store, face.value.context);
  if (values.$text === undefined || values.$text.type === "none") return giveValue(machine, NONE);
  const font = values.$font?.type === "object" ? readContext(machine.store, values.$font.value.context) : null;
  const style = font === null || font.$style.type === "none" ? "" : readStyleWords(machine.store, font.$style);
  return giveValue(machine, makePair(measureText(readRest(machine.store, values.$text), font === null ? null : { size: font.$size.value, style })));
};

/**
 * @uses readRest (src/store/store.mjs)
 * @usedby sizeText
 */
const readStyleWords = (store, value) =>
  value.type === "block" ? readRest(store, value).map((word) => word.value).join(" ") : String(value.value);

/**
 * The natives of REBOL View. Each entry has the name of REBOL and the function.
 * @uses makeLayout, sizeText
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const VIEW_NATIVES = {
  layout: makeLayout,
  "size-text": sizeText,
};
