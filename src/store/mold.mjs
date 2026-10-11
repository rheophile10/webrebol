/** @import { Datum, Store } from "../types/states.mjs" */
import { escapeBraces, escapeControls, escapeInLines } from "../data/escape.mjs";
import { isList, readContext, readRest } from "./store.mjs";
import { MONTHS, readDays } from "../data/dates.mjs";
import { unpackPixel } from "../data/pixels.mjs";

const DIGITS = 15;
const QUOTE_LIMIT = 50;
const ESCAPE_LIMIT = 3;
const BINARY_LINE = 32;
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
 * @uses QUOTE_LIMIT, countMatches, ESCAPE_LIMIT
 * @usedby moldString
 */
const needsBraces = (text) =>
  // REBOL counts the characters that need an escape, but it does not count the last character of the text.
  text.includes('"') || text.length > QUOTE_LIMIT || countMatches(text.slice(0, -1), /[\x00-\x1F\x7F^]/g) >= ESCAPE_LIMIT;

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
 * @usedby moldSeconds, moldTime, moldZone
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
 * @usedby moldDate, MOLDERS
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
 * @usedby moldBinary, moldImage
 */
const moldByte = (byte) => byte.toString(16).toUpperCase().padStart(2, "0");

const INDENT = "    ";
const DEPTH_LIMIT = 60;

/**
 * @usedby MOLDERS
 */
const moldMoney = (money) => `${money.amount < 0 ? "-" : ""}${money.code}$${Math.abs(money.amount).toFixed(2)}`;

/**
 * @uses NANOSECONDS, padField
 * @usedby moldDate
 */
const moldZone = (zone) => {
  const minutes = Math.abs(zone) / (60 * NANOSECONDS);
  return `${zone < 0 ? "-" : "+"}${Math.floor(minutes / 60)}:${padField(minutes % 60)}`;
};

/**
 * @uses readDays (src/data/dates.mjs), MONTHS (src/data/dates.mjs), moldTime, moldZone
 * @usedby MOLDERS
 */
const moldDate = (date) => {
  // The time and the time zone show only if the date has them.
  const parts = readDays(date.days);
  const day = `${parts.day}-${MONTHS[parts.month - 1]}-${String(parts.year).padStart(4, "0")}`;
  if (date.time === null) return day;
  return `${day}/${moldTime(date.time)}${date.zone === 0 ? "" : moldZone(date.zone)}`;
};

/**
 * @uses BINARY_LINE, moldByte
 * @usedby MOLDERS
 */
const moldBinary = (bytes) => {
  // A binary of 32 bytes or more shows in lines of 32 bytes.
  if (bytes.length < BINARY_LINE) return `#{${bytes.map(moldByte).join("")}}`;
  const lines = Array.from({ length: Math.ceil(bytes.length / BINARY_LINE) }, (unused, place) =>
    bytes.slice(place * BINARY_LINE, (place + 1) * BINARY_LINE).map(moldByte).join(""),
  );
  return `#{\n${lines.join("\n")}\n}`;
};

/**
 * @uses unpackPixel (src/data/pixels.mjs), BINARY_LINE, moldByte
 * @usedby MOLDERS
 */
const moldImage = (size, pixels) => {
  // The colors of an image show in lines of 32 bytes, between two line ends.
  const bytes = pixels.flatMap((pixel) => unpackPixel(pixel).slice(0, 3));
  const lines = Array.from({ length: Math.ceil(bytes.length / BINARY_LINE) }, (unused, place) =>
    bytes.slice(place * BINARY_LINE, (place + 1) * BINARY_LINE).map(moldByte).join(""),
  );
  return `make image! [${size.join("x")} #{${bytes.length === 0 ? "" : `\n${lines.join("\n")}\n`}}]`;
};

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
 * @uses readContext, INDENT, moldValue
 * @usedby MOLDERS
 */
const moldObject = (store, object, depth) => {
  // Each word is on its own line. An inner object has a larger indent.
  const values = readContext(store, object.value.context);
  const moldField = (name) =>
    `${INDENT.repeat(depth + 1)}${name}: ${moldValue(store, values[`$${name.toLowerCase()}`], depth + 1)}`;
  return ["make object! [", ...object.value.words.map(moldField), `${INDENT.repeat(depth)}]`].join("\n");
};

/**
 * @uses moldDecimal, moldString, readRest, moldChar, moldName, moldRest, moldPath, encodeHex, moldRaw, moldTime,
 *   moldBinary, moldObject, moldImage, moldMoney, moldDate, moldValue
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
  binary: (store, binary) => moldBinary(readRest(store, binary)),
  logic: (store, logic) => String(logic.value),
  none: () => "none",
  unset: () => "unset",
  datatype: (store, datatype) => `${datatype.value}!`,
  error: (store, error) => `make error! [${error.value}]`,
  object: moldObject,
  image: (store, image) => moldImage(image.value.size, readRest(store, image)),
  event: (store, event) => `make event! [type: '${event.value.kind} offset: ${event.value.offset.join("x")}]`,
  hash: (store, hash, depth) => `make hash! [${moldRest(store, hash, depth + 1)}]`,
  list: (store, list, depth) => `make list! [${moldRest(store, list, depth + 1)}]`,
  native: () => "native",
  action: () => "action",
  "op": () => "op",
  money: (store, money) => moldMoney(money.value),
  date: (store, date) => moldDate(date.value),
  bitset: (store, bitset) => `make bitset! ${moldBinary(bitset.value)}`,
  function: (store, callee) => `func ${moldValue(store, callee.value.spec)}${moldValue(store, callee.value.body)}`,
};

/**
 * Makes the REBOL source text of one value.
 * @param {Store} store
 * @param {Datum} value
 * @param {number} [depth] - The number of blocks and objects around the value. It gives the indent of an object.
 * @returns {string}
 * @standard reference - The text is the text that `mold` of REBOL 2.7.8 gives.
 * @uses DEPTH_LIMIT, MOLDERS
 * @usedby 13 declarations in compare, files, report, text, words, interpret, mold
 */
export const moldValue = (store, value, depth = 0) =>
  // A value that holds itself has no end. Stop at a large depth.
  depth > DEPTH_LIMIT ? "..." : (MOLDERS[value.type] ?? (() => "?function?"))(store, value, depth);

/**
 * Makes the REBOL source text of the items of a block, without brackets around them.
 * @param {Store} store
 * @param {Datum} block
 * @param {number} [depth] - The number of blocks and objects around the items.
 * @returns {string}
 * @standard reference - The text is the text that `mold/only` of REBOL 2.7.8 gives.
 * @uses readRest, moldValue
 * @usedby saveValue (src/natives/files.mjs), MOLDERS, moldSource (test/load.test.mjs)
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
 * @usedby 19 declarations in convert, encode, files, items, parse, random, report, search, series, text, elements
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
