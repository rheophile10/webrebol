/** @import { Datum, Store } from "../types/states.mjs" */
import { escapeBraces, escapeControls, escapeInLines } from "../data/escape.mjs";
import { isList, readRest } from "./store.mjs";

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
 * @uses needsBraces, escapeBraces (src/data/escape.mjs), escapeInLines (src/data/escape.mjs),
 *   escapeControls (src/data/escape.mjs)
 * @usedby MOLDERS
 */
const moldString = (text) =>
  needsBraces(text) ? `{${escapeBraces(escapeInLines(text))}}` : `"${escapeControls(text)}"`;

/**
 * @uses QUOTE_CODE, escapeControls (src/data/escape.mjs)
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

const INDENT = "    ";

/**
 * @uses readRest, moldValue
 * @usedby MOLDERS
 */
const moldPath = (store, path) =>
  readRest(store, path)
    .map((item) => moldValue(store, item))
    .join("/");

/**
 * @usedby MOLDERS
 */
const moldName = (store, word) => word.value;

/**
 * @uses readRest
 * @usedby MOLDERS, FORMERS
 */
const moldRaw = (store, text) => readRest(store, text);

/**
 * @uses INDENT, moldValue
 * @usedby MOLDERS
 */
const moldObject = (store, object, depth) => {
  // Each word is on its own line. An inner object has a larger indent.
  const values = store.contexts[object.value.context];
  const moldField = (name) =>
    `${INDENT.repeat(depth + 1)}${name}: ${moldValue(store, values[`$${name.toLowerCase()}`], depth + 1)}`;
  return ["make object! [", ...object.value.words.map(moldField), `${INDENT.repeat(depth)}]`].join("\n");
};

/**
 * @uses moldDecimal, moldString, readRest, moldChar, moldName, moldRest, moldPath, encodeHex, moldRaw, moldTime,
 *   moldByte, moldObject, moldValue
 * @usedby moldValue
 */
const MOLDERS = {
  integer: (store, integer) => String(integer.value),
  decimal: (store, decimal) => moldDecimal(decimal.value),
  string: (store, string) => moldString(readRest(store, string)),
  char: (store, char) => moldChar(char.value),
  word: moldName,
  "set-word": (store, word) => `${word.value}:`,
  "get-word": (store, word) => `:${word.value}`,
  "lit-word": (store, word) => `'${word.value}`,
  refinement: (store, word) => `/${word.value}`,
  block: (store, block, depth) => `[${moldRest(store, block, depth + 1)}]`,
  paren: (store, paren, depth) => `(${moldRest(store, paren, depth + 1)})`,
  path: moldPath,
  "set-path": (store, path) => `${moldPath(store, path)}:`,
  "lit-path": (store, path) => `'${moldPath(store, path)}`,
  issue: (store, issue) => `#${readRest(store, issue)}`,
  file: (store, file) => `%${readRest(store, file).replace(/[\x00-\x20\x7F%]/g, encodeHex)}`,
  email: moldRaw,
  url: moldRaw,
  tag: (store, tag) => `<${readRest(store, tag)}>`,
  tuple: (store, tuple) => tuple.value.join("."),
  pair: (store, pair) => pair.value.join("x"),
  time: (store, time) => moldTime(time.value),
  binary: (store, binary) => `#{${readRest(store, binary).map(moldByte).join("")}}`,
  logic: (store, logic) => String(logic.value),
  none: () => "none",
  unset: () => "unset",
  datatype: (store, datatype) => `${datatype.value}!`,
  error: (store, error) => `make error! [${error.value}]`,
  object: moldObject,
  bitset: (store, bitset) => `make bitset! #{\n${bitset.value.map(moldByte).join("")}\n}`,
  function: (store, callee) => `func ${moldValue(store, callee.value.spec)}${moldValue(store, callee.value.body)}`,
};

/**
 * Makes the REBOL source text of one value.
 * @param {Store} store
 * @param {Datum} value
 * @param {number} [depth] - The number of blocks and objects around the value. It gives the indent of an object.
 * @returns {string}
 * @standard reference - The text is the text that `mold` of REBOL 2.7.8 gives.
 * @uses MOLDERS
 * @usedby 10 declarations in interpret, report, text, mold
 */
export const moldValue = (store, value, depth = 0) =>
  (MOLDERS[value.type] ?? (() => "?function?"))(store, value, depth);

/**
 * Makes the REBOL source text of the items of a block, without brackets around them.
 * @param {Store} store
 * @param {Datum} block
 * @param {number} [depth] - The number of blocks and objects around the items.
 * @returns {string}
 * @standard reference - The text is the text that `mold/only` of REBOL 2.7.8 gives.
 * @uses readRest, moldValue
 * @usedby MOLDERS, moldSource (test/load.test.mjs)
 */
export const moldRest = (store, block, depth = 0) =>
  readRest(store, block)
    .map((item) => moldValue(store, item, depth))
    .join(" ");

/**
 * @uses moldRaw
 * @usedby formValue
 */
const FORMERS = {
  string: moldRaw,
  char: (store, char) => String.fromCharCode(char.value),
};

/**
 * Makes the text of a value for a person to read.
 * @param {Store} store
 * @param {Datum} value
 * @returns {string}
 * @standard reference - The text is the text that `form` of REBOL 2.7.8 gives.
 * @uses isList, readRest, FORMERS, moldValue
 * @usedby 11 declarations in convert, parse, report, search, series, text
 */
export const formValue = (store, value) => {
  // The items of a block are formed and joined, without brackets.
  if (isList(value) && value.type !== "path") {
    return readRest(store, value)
      .map((item) => formValue(store, item))
      .join(" ");
  }
  return (FORMERS[value.type] ?? moldValue)(store, value);
};
