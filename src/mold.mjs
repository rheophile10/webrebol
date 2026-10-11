/** @import { Datum } from "./types/results.mjs" */
import { escapeBraces, escapeControls, escapeInLines } from "./escape.mjs";

const DIGITS = 15;
const QUOTE_LIMIT = 50;
const LINE_LIMIT = 3;
const ESCAPE_LIMIT = 4;
const NANOSECONDS = 1e9;
const QUOTE_CODE = 34;

/**
 * @usedby moldDecimal
 */
const moldExponent = (mantissa, exponent) =>
  `${String(Number(mantissa))}E${exponent < 0 ? "-" : "+"}${Math.abs(exponent)}`;

/**
 * @uses DIGITS
 * @usedby moldDecimal
 */
const moldFixed = (number) => {
  // Keep 15 digits. A decimal always shows a point.
  const text = String(Number(number.toPrecision(DIGITS)));
  return text.includes(".") ? text : `${text}.0`;
};

/**
 * @uses DIGITS, moldExponent, moldFixed
 * @usedby MOLDERS
 */
const moldDecimal = (number) => {
  // Find the exponent of the number after it is rounded to 15 digits.
  const [mantissa, exponent] = number.toExponential(DIGITS - 1).split("e").map(Number);
  if (number === 0) return "0.0";
  // REBOL shows an exponent for a very small or a very large number.
  return exponent < -4 || exponent >= DIGITS ? moldExponent(mantissa, exponent) : moldFixed(number);
};

/**
 * @usedby needsBraces
 */
const countMatches = (text, pattern) => (text.match(pattern) ?? []).length;

/**
 * @uses QUOTE_LIMIT, countMatches, LINE_LIMIT, ESCAPE_LIMIT
 * @usedby moldString
 */
const needsBraces = (text) =>
  text.includes('"') ||
  text.length > QUOTE_LIMIT ||
  countMatches(text, /\n/g) >= LINE_LIMIT ||
  countMatches(text, /[\x00-\x1F\x7F^]/g) >= ESCAPE_LIMIT;

/**
 * @uses needsBraces, escapeBraces, escapeInLines, escapeControls
 * @usedby MOLDERS
 */
const moldString = (text) =>
  needsBraces(text) ? `{${escapeBraces(escapeInLines(text))}}` : `"${escapeControls(text)}"`;

/**
 * @uses QUOTE_CODE, escapeControls
 * @usedby MOLDERS
 */
const moldChar = (code) => `#"${code === QUOTE_CODE ? '^"' : escapeControls(String.fromCharCode(code))}"`;

/**
 * @usedby moldSeconds, moldTime
 */
const padField = (number) => String(number).padStart(2, "0");

/**
 * @uses NANOSECONDS, padField
 * @usedby moldTime
 */
const moldSeconds = (nanoseconds) => {
  // Show the seconds only if they are not zero. Show the fraction without zeros at its end.
  const fraction = String(nanoseconds % NANOSECONDS).padStart(9, "0").replace(/0+$/, "");
  const seconds = padField(Math.floor(nanoseconds / NANOSECONDS));
  if (nanoseconds === 0) return "";
  return fraction === "" ? `:${seconds}` : `:${seconds}.${fraction}`;
};

/**
 * @uses NANOSECONDS, padField, moldSeconds
 * @usedby MOLDERS
 */
const moldTime = (nanoseconds) => {
  // Divide the time into hours, minutes, and the remaining nanoseconds.
  const size = Math.abs(nanoseconds);
  const minutes = Math.floor(size / (60 * NANOSECONDS));
  const head = `${Math.floor(minutes / 60)}:${padField(minutes % 60)}`;
  return `${nanoseconds < 0 ? "-" : ""}${head}${moldSeconds(size % (60 * NANOSECONDS))}`;
};

/**
 * @usedby MOLDERS
 */
const encodeHex = (character) => `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;

/**
 * @usedby MOLDERS
 */
const moldByte = (byte) => byte.toString(16).toUpperCase().padStart(2, "0");

/**
 * @uses moldDatum
 * @usedby MOLDERS
 */
const moldPath = (items) => items.map(moldDatum).join("/");

/**
 * @uses moldDecimal, moldString, moldChar, moldItems, moldPath, encodeHex, moldTime, moldByte
 * @usedby moldDatum
 */
const MOLDERS = {
  integer: String,
  decimal: moldDecimal,
  string: moldString,
  char: moldChar,
  word: String,
  "set-word": (name) => `${name}:`,
  "get-word": (name) => `:${name}`,
  "lit-word": (name) => `'${name}`,
  refinement: (name) => `/${name}`,
  block: (items) => `[${moldItems(items)}]`,
  paren: (items) => `(${moldItems(items)})`,
  path: moldPath,
  "set-path": (items) => `${moldPath(items)}:`,
  "lit-path": (items) => `'${moldPath(items)}`,
  issue: (text) => `#${text}`,
  file: (text) => `%${text.replace(/[\x00-\x20\x7F%]/g, encodeHex)}`,
  email: String,
  url: String,
  tag: (text) => `<${text}>`,
  tuple: (parts) => parts.join("."),
  pair: (parts) => parts.join("x"),
  time: moldTime,
  binary: (bytes) => `#{${bytes.map(moldByte).join("")}}`,
  logic: String,
  none: () => "none",
};

/**
 * Makes the REBOL source text of one value.
 * @param {Datum} datum
 * @returns {string}
 * @standard reference - The text is the text that `mold` of REBOL 2.7.8 gives.
 * @uses MOLDERS
 * @usedby moldPath, moldItems
 */
export const moldDatum = (datum) => MOLDERS[datum.type](datum.value);

/**
 * Makes the REBOL source text of a list of values, without brackets around the list.
 * @param {Datum[]} items
 * @returns {string}
 * @standard reference - The text is the text that `mold/only` of REBOL 2.7.8 gives.
 * @uses moldDatum
 * @usedby bin/webrebol.mjs, MOLDERS, moldSource (test/load.test.mjs)
 */
export const moldItems = (items) => items.map(moldDatum).join(" ");
