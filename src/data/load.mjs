/** @import { Datum } from "../types/states.mjs" */
import { scanTokens } from "./tokens.mjs";
import { makeDatum, readToken } from "./datum.mjs";
import { EMPTY_CHUNKS, joinChunks, pushItem } from "./chunks.mjs";

const OPEN_TYPES = { "[": "block", "(": "paren" };
const CLOSE_TYPES = { "]": "block", ")": "paren" };
const CLOSERS = { block: "]", paren: ")" };
/**
 * @uses makeDatum
 * @usedby closeFrame, loadSource
 */
const MISSING = makeDatum("error", "syntax missing");
/**
 * @uses EMPTY_CHUNKS
 * @usedby loadSource
 */
const START = { frames: [{ type: "block", items: EMPTY_CHUNKS }], error: null };

/**
 * @uses pushItem
 * @usedby closeFrame, addToken
 */
const addDatum = (frames, datum) => {
  // Make a new top frame that has the datum at its end.
  const top = frames[frames.length - 1];
  return [...frames.slice(0, -1), { type: top.type, items: pushItem(top.items, datum) }];
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
 * @uses CLOSE_TYPES, makeDatum, joinChunks, addDatum, MISSING
 * @usedby STEPS
 */
const closeFrame = (state, token) => {
  // A closing bracket must agree with the frame that is open.
  const top = state.frames[state.frames.length - 1];
  const agrees = state.frames.length > 1 && top.type === CLOSE_TYPES[token.text];
  // Put the complete frame into the frame below it.
  const block = makeDatum(top.type, joinChunks(top.items));
  return agrees ? { ...state, frames: addDatum(state.frames.slice(0, -1), block) } : { ...state, error: MISSING };
};

/**
 * @uses readToken, addDatum
 * @usedby stepLoad
 */
const addToken = (state, token) => {
  // An invalid token stops the load.
  const datum = readToken(token);
  return datum.type === "error" ? { ...state, error: datum } : { ...state, frames: addDatum(state.frames, datum) };
};

/**
 * @uses openFrame, closeFrame
 * @usedby stepLoad
 */
const STEPS = { open: openFrame, close: closeFrame };

/**
 * @uses STEPS, addToken
 * @usedby loadSource
 */
const stepLoad = (state, token) => (state.error === null ? (STEPS[token.kind] ?? addToken)(state, token) : state);

/**
 * Makes the block of REBOL values that a source text shows.
 * @param {string} source - The REBOL source text.
 * @returns {Datum}
 * @standard reference - The values are the values that `load/all` of REBOL 2.7.8 gives.
 * @standard missing - A bracket without its partner gives an error datum with the text "syntax missing".
 * @todo Read date, money, base-64 binary, and a path that has a paren.
 * @todo Keep the line ends of the source, because `mold` shows them.
 * @uses scanTokens, stepLoad, START, makeDatum, joinChunks, MISSING, CLOSERS
 * @usedby 12 declarations in control, convert, files, items, words, globals, interpret, data, load, machine
 */
export const loadSource = (source) => {
  // Put each token into the frame that is open.
  const state = scanTokens(source).reduce(stepLoad, START);
  if (state.error !== null) return state.error;
  // Only the root frame can stay open at the end. The error names the bracket that is not there.
  if (state.frames.length === 1) return makeDatum("block", joinChunks(state.frames[0].items));
  return { ...MISSING, args: ["end-of-script", CLOSERS[state.frames[state.frames.length - 1].type]] };
};
