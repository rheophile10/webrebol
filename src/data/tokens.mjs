/** @import { Token } from "../types/results.mjs" */

const BRACE_DEPTH = 16;
const NO_MATCH = "(?!)";

/**
 * @usedby PIECES
 */
const nestBraces = (inner) => `\\{(?:\\^[\\s\\S]|[^{}^]|${inner})*\\}`;

/**
 * @uses BRACE_DEPTH, nestBraces, NO_MATCH
 * @usedby PATTERN, KINDS
 */
const PIECES = [
  ["space", "\\s+"],
  ["comment", ";[^\\n]*"],
  ["open", "[\\[(]"],
  ["close", "[\\])]"],
  ["char", '#"(?:\\^\\([0-9A-Za-z]+\\)|\\^.|[^"^])"'],
  ["binary", "(?:2|16|64)?#\\{[^}]*\\}"],
  ["construct", "#\\[[^\\]]*\\]"],
  ["quotedFile", '%"[^"]*"'],
  ["string", '"(?:\\^.|[^"^\\n])*"'],
  ["braces", Array.from({ length: BRACE_DEPTH }).reduce(nestBraces, NO_MATCH)],
  ["tag", "<(?![\\s=<>])[^>\\s][^>]*>|<[^\\s=<>]>"],
  ["run", '[^\\s\\[\\](){}";]+'],
  ["invalid", "[\\s\\S]"],
];

/**
 * @uses PIECES
 * @usedby scanTokens
 */
const PATTERN = new RegExp(PIECES.map(([kind, piece]) => `(?<${kind}>${piece})`).join("|"), "g");

const IGNORED_KINDS = ["space", "comment"];

/**
 * @uses PIECES
 * @usedby makeToken
 */
const KINDS = PIECES.map(([kind]) => kind);

/**
 * @uses KINDS
 * @usedby scanTokens
 */
const makeToken = (match) => {
  // Find the one group that has text. Its position gives the kind.
  const place = match.findIndex((part, index) => index > 0 && part !== undefined);
  return { kind: KINDS[place - 1], text: match[place] };
};

/**
 * @usedby scanTokens
 */
const splitRun = (token) => {
  // An issue stops at a slash. A run of refinements without spaces is one token for each refinement.
  const cut = token.kind === "run" && token.text.startsWith("#") ? token.text.indexOf("/") : -1;
  if (cut > 0) return [{ ...token, text: token.text.slice(0, cut) }, ...splitRun({ kind: "run", text: token.text.slice(cut), glued: false })];
  const parts = token.kind === "run" && !token.glued && /^\/[^/]+\/./.test(token.text) ? token.text.match(/\/[^/]*/g) : null;
  return parts === null ? [token] : parts.map((text) => ({ kind: "run", text, glued: false }));
};

/**
 * @uses IGNORED_KINDS
 * @usedby scanTokens
 */
const markGlued = (token, place, all) => ({
  // A token is glued if no space is between it and the token before it. A path with a paren needs this fact.
  ...token,
  glued: place > 0 && !IGNORED_KINDS.includes(all[place - 1].kind),
});

/**
 * @uses PATTERN, makeToken, markGlued, IGNORED_KINDS, splitRun
 * @usedby loadSource
 */
/**
 * Divides a source text into its lexical parts, without the spaces and the comments.
 * @param {string} source - The REBOL source text.
 * @returns {Token[]}
 * @keypoint A brace string can hold nested braces to a depth of 16 only.
 * @uses PATTERN, makeToken, markGlued, IGNORED_KINDS, splitRun
 * @usedby loadSource
 */
export const scanTokens = (source) =>
  [...source.matchAll(PATTERN)]
    .map(makeToken)
    .map(markGlued)
    .filter((token) => !IGNORED_KINDS.includes(token.kind))
    .flatMap(splitRun);
