/** @import { Datum } from "../types/states.mjs" */
import { scanTokens } from "./tokens.mjs";
import { makeDatum, readToken } from "./datum.mjs";

const OPEN_TYPES = { "[": "block", "(": "paren" };
const CLOSE_TYPES = { "]": "block", ")": "paren" };
const CLOSERS = { block: "]", paren: ")" };
/**
 * @uses makeDatum
 * @usedby closeFrame, loadSource
 */
const MISSING = makeDatum("error", "syntax missing");
/**
 * @uses makeDatum
 * @usedby loadSource
 */
const START = { frames: [makeDatum("block", [])], error: null };

/**
 * @uses makeDatum
 * @usedby closeFrame, addToken
 */
const addDatum = (frames, datum) => {
  // Make a new top frame that has the datum at its end.
  const top = frames[frames.length - 1];
  return [...frames.slice(0, -1), makeDatum(top.type, [...top.value, datum])];
};

/**
 * @uses makeDatum, OPEN_TYPES
 * @usedby STEPS
 */
const openFrame = (state, token) => ({
  ...state,
  frames: [...state.frames, makeDatum(OPEN_TYPES[token.text], [])],
});

/**
 * @uses CLOSE_TYPES, addDatum, MISSING
 * @usedby STEPS
 */
const closeFrame = (state, token) => {
  // A closing bracket must agree with the frame that is open.
  const top = state.frames[state.frames.length - 1];
  const agrees = state.frames.length > 1 && top.type === CLOSE_TYPES[token.text];
  // Put the complete frame into the frame below it.
  return agrees ? { ...state, frames: addDatum(state.frames.slice(0, -1), top) } : { ...state, error: MISSING };
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
 * @uses scanTokens, stepLoad, START, MISSING, CLOSERS
 * @usedby doText (src/natives/control.mjs), toBlock (src/natives/convert.mjs), readLoaded (src/natives/convert.mjs),
 *   makeFunction (src/natives/globals.mjs), interpretSource (src/natives/interpret.mjs),
 *   moldSource (test/load.test.mjs), makeReady (test/machine.test.mjs)
 */
export const loadSource = (source) => {
  // Put each token into the frame that is open.
  const state = scanTokens(source).reduce(stepLoad, START);
  if (state.error !== null) return state.error;
  // Only the root frame can stay open at the end. The error names the bracket that is not there.
  if (state.frames.length === 1) return state.frames[0];
  return { ...MISSING, args: ["end-of-script", CLOSERS[state.frames[state.frames.length - 1].type]] };
};
