/** @import { Datum } from "../types/states.mjs" */
import { scanTokens } from "./tokens.mjs";
import { makeConstruct, makeDatum, readToken } from "./datum.mjs";
import { EMPTY_CHUNKS, joinChunks, pushItem } from "./chunks.mjs";

const OPEN_TYPES = { "[": "block", "(": "paren", "#[": "construct" };
const CLOSE_TYPES = { "]": "block", ")": "paren" };
const CLOSERS = { block: "]", paren: ")" };
/**
 * @uses makeDatum
 * @usedby closeFrame, startPath, loadSource
 */
const MISSING = makeDatum("error", "syntax missing");
/**
 * @uses EMPTY_CHUNKS
 * @usedby loadSource
 */
const START = { frames: [{ type: "block", items: EMPTY_CHUNKS }], error: null, path: null };

/**
 * @uses pushItem
 * @usedby closeFrame, addToken, endPath
 */
const addDatum = (frames, datum) => {
  // Make a new top frame that has the datum at its end.
  const top = frames[frames.length - 1];
  return [...frames.slice(0, -1), { ...top, items: pushItem(top.items, datum) }];
};

/**
 * @uses OPEN_TYPES, EMPTY_CHUNKS
 * @usedby STEPS
 */
const openFrame = (state, token) => ({
  ...state,
  frames: [...state.frames, { type: OPEN_TYPES[token.text], items: EMPTY_CHUNKS }],
});

/**
 * @uses CLOSE_TYPES, MISSING, joinChunks, makeConstruct, makeDatum, addDatum
 * @usedby STEPS
 */
const closeFrame = (state, token) => {
  // A closing bracket must agree with the frame that is open.
  const top = state.frames[state.frames.length - 1];
  const wanted = top.type === "construct" ? "block" : top.type;
  if (state.frames.length < 2 || wanted !== CLOSE_TYPES[token.text]) return { ...state, error: MISSING };
  // Put the complete frame into the frame below it. A construct gives the value that its items describe.
  const items = joinChunks(top.items);
  const made = top.type === "construct" ? makeConstruct(items) : makeDatum(top.type, items);
  return made.type === "error" ? { ...state, error: made } : { ...state, frames: addDatum(state.frames.slice(0, -1), made) };
};

/**
 * @uses readToken, addDatum
 * @usedby stepToken
 */
const addToken = (state, token) => {
  // An invalid token stops the load.
  const datum = readToken(token);
  return datum.type === "error" ? { ...state, error: datum } : { ...state, frames: addDatum(state.frames, datum) };
};

/**
 * @uses openFrame, closeFrame
 * @usedby stepToken
 */
const STEPS = { open: openFrame, close: closeFrame, construct: openFrame };

const WORD_KINDS = ["word", "get-word", "lit-word"];

/**
 * @uses readToken
 * @usedby continuePath
 */
const readParts = (text) => text.split("/").map((part) => readToken({ kind: "run", text: part }));

/**
 * @uses readToken, WORD_KINDS, MISSING
 * @usedby stepToken
 */
const startPath = (state, token) => {
  // A run that ends with a slash is the start of a path. The next part is a paren.
  const head = readToken({ kind: "run", text: token.text.slice(0, -1) });
  const items = head.type === "path" ? head.value : [head];
  const valid = head.type === "path" || WORD_KINDS.includes(head.type);
  return valid ? { ...state, path: { items, waiting: true } } : { ...state, error: head.type === "error" ? head : MISSING };
};

/**
 * @uses makeDatum
 * @usedby endPath
 */
const INVALID_PATH = { ...makeDatum("error", "syntax invalid"), args: ["path", "/"] };

/**
 * @uses INVALID_PATH, addDatum, makeDatum
 * @usedby continuePath, stepPath, loadSource
 */
const endPath = (state, type) =>
  // A path cannot end with a slash.
  state.path.waiting
    ? { ...state, error: INVALID_PATH }
    : { ...state, path: null, frames: addDatum(state.frames, makeDatum(type, state.path.items)) };

/**
 * @uses endPath, readParts
 * @usedby stepPath
 */
const continuePath = (state, token) => {
  // After a paren, a glued run that starts with a slash gives more parts. A colon makes a set-path.
  const text = token.text.slice(1);
  if (token.text === ":") return endPath(state, "set-path");
  const body = text.replace(/[/:]$/, "");
  const parts = body === "" ? [] : readParts(body);
  const bad = parts.find((part) => part.type === "error");
  if (bad !== undefined) return { ...state, error: bad };
  const grown = { ...state, path: { items: [...state.path.items, ...parts], waiting: text.endsWith("/") } };
  return text.endsWith(":") ? endPath(grown, "set-path") : grown;
};

/**
 * @usedby stepToken
 */
const isPathStart = (token) =>
  token.kind === "run" && /^[^/%#<"]([^]*[^/])?\/$/.test(token.text) && !/^[a-z][a-z0-9+.-]*:/i.test(token.text);

/**
 * @uses EMPTY_CHUNKS, continuePath, stepToken, endPath
 * @usedby stepToken
 */
const stepPath = (state, token) => {
  // A paren directly after the slash is a part of the path. Other tokens end the path.
  if (state.path.waiting && token.glued && token.text === "(") {
    // The frame of the paren keeps the parts of its path. Thus a path in the paren can be read.
    const frame = { type: "paren", items: EMPTY_CHUNKS, inPath: true, parts: state.path.items };
    return { ...state, path: null, frames: [...state.frames, frame] };
  }
  const glued = token.glued && token.kind === "run" && !state.path.waiting && (token.text.startsWith("/") || token.text === ":");
  return glued ? continuePath(state, token) : stepToken(endPath(state, "path"), token);
};

/**
 * @uses makeDatum, joinChunks
 * @usedby stepToken
 */
const closePathParen = (state) => {
  // The paren of a path goes into the path, not into the block around it.
  const top = state.frames[state.frames.length - 1];
  const paren = makeDatum("paren", joinChunks(top.items));
  return { ...state, frames: state.frames.slice(0, -1), path: { items: [...top.parts, paren], waiting: false } };
};

/**
 * @uses stepPath, closePathParen, isPathStart, startPath, STEPS, addToken
 * @usedby stepPath, stepLoad
 */
const stepToken = (state, token) => {
  const top = state.frames[state.frames.length - 1];
  if (state.path !== null) return stepPath(state, token);
  if (top.inPath === true && token.text === ")") return closePathParen(state);
  if (isPathStart(token)) return startPath(state, token);
  return (STEPS[token.kind] ?? addToken)(state, token);
};

/**
 * @uses stepToken
 * @usedby loadSource
 */
const stepLoad = (state, token) => (state.error === null ? stepToken(state, token) : state);

/**
 * Makes the block of REBOL values that a source text shows.
 * @param {string} source - The REBOL source text.
 * @returns {Datum}
 * @standard reference - The values are the values that `load/all` of REBOL 2.7.8 gives.
 * @standard missing - A bracket without its partner gives an error datum with the text "syntax missing".
 * @todo Read base-64 binary.
 * @todo Keep the line ends of the source, because `mold` shows them.
 * @uses scanTokens, stepLoad, START, endPath, makeDatum, joinChunks, MISSING, CLOSERS
 * @usedby 14 declarations in compare, conform, control, convert, files, items, words, globals, interpret, data, load, machine
 */
export const loadSource = (source) => {
  // Put each token into the frame that is open.
  const read = scanTokens(source).reduce(stepLoad, START);
  if (read.error !== null) return read.error;
  // A path that is open at the end of the text is complete.
  const state = read.path !== null ? endPath(read, "path") : read;
  if (state.error !== null) return state.error;
  // Only the root frame can stay open at the end. The error names the bracket that is not there.
  if (state.frames.length === 1) return makeDatum("block", joinChunks(state.frames[0].items));
  return { ...MISSING, args: ["end-of-script", CLOSERS[state.frames[state.frames.length - 1].type]] };
};
