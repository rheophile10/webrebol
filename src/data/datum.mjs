/** @import { Datatype } from "../types/categories.mjs" */
/** @import { Token } from "../types/results.mjs" */
/** @import { Datum } from "../types/states.mjs" */
import { unescapeText } from "./escape.mjs";

const INTEGER_LIMIT = 2147483648;
const NANOSECONDS = 1e9;
const WORD = "[A-Za-z?!.*&|=_~+\\-^`](?<![+-](?=\\d))[A-Za-z0-9?!.*&|=_~+\\-^`']*";
const BINARY_BASES = { 2: 8, 16: 2 };
const CONSTRUCTS = { "#[true]": ["logic", true], "#[false]": ["logic", false], "#[none]": ["none", null] };

/**
 * Makes a datum from a type and its data.
 * @param {Datatype} type
 * @param {Datum["value"]} value - The data of the value.
 * @returns {Datum}
 * @usedby 51 declarations in datum, load, machine, path, bitsets, compare, control, convert, faults, globals, loops, math, numbers, objects, parse, series, store
 */
export const makeDatum = (type, value) => ({ type, value });

/**
 * @uses makeDatum
 * @usedby readTuple, readFile, readPath, readRun, readBinary, readConstruct, TOKEN_READERS
 */
const INVALID = makeDatum("error", "syntax invalid");

/**
 * @usedby readInteger, readDecimal
 */
const readNumber = (text) => Number(text.replace(/'/g, "").replace(",", "."));

/**
 * @uses readNumber, makeDatum, INTEGER_LIMIT
 * @usedby RUN_READERS
 */
const readInteger = (text) => {
  // An integer that 32 bits cannot hold becomes a decimal.
  const number = readNumber(text);
  return makeDatum(number >= -INTEGER_LIMIT && number < INTEGER_LIMIT ? "integer" : "decimal", number);
};

/**
 * @uses makeDatum, readNumber
 * @usedby RUN_READERS
 */
const readDecimal = (text) => makeDatum("decimal", readNumber(text));

/**
 * @uses makeDatum
 * @usedby RUN_READERS
 */
const readPair = (text) => makeDatum("pair", text.toLowerCase().split("x").map(Number));

/**
 * @uses makeDatum, INVALID
 * @usedby RUN_READERS
 */
const readTuple = (text) => {
  // A tuple has 3 to 10 parts. Each part is a byte.
  const parts = text.split(".").map(Number);
  return parts.length <= 10 && parts.every((part) => part <= 255) ? makeDatum("tuple", parts) : INVALID;
};

/**
 * @uses makeDatum, NANOSECONDS
 * @usedby RUN_READERS
 */
const readTime = (text) => {
  // Divide the text into the sign and the fields. An absent field is zero.
  const sign = text.startsWith("-") ? -1 : 1;
  const [hours, minutes, seconds = 0] = text.replace(/^[+-]/, "").replace(",", ".").split(":").map(Number);
  // Keep the time as a whole number of nanoseconds.
  return makeDatum("time", sign * Math.round((hours * 3600 + minutes * 60 + seconds) * NANOSECONDS));
};

/**
 * @usedby readFile
 */
const decodeHex = (code, digits) => String.fromCharCode(parseInt(digits, 16));

/**
 * @uses INVALID, makeDatum, decodeHex
 * @usedby RUN_READERS
 */
const readFile = (text) =>
  text === "%" ? INVALID : makeDatum("file", text.slice(1).replace(/%([0-9A-Fa-f]{2})/g, decodeHex));

/**
 * @uses readRun, INVALID, makeDatum
 * @usedby RUN_READERS
 */
const readPath = (text) => {
  // A colon at the end makes a set-path.
  const body = text.endsWith(":") ? text.slice(0, -1) : text;
  const items = body.split("/").map(readRun);
  // A path is invalid if one of its parts is invalid.
  if (items.some((item) => item.type === "error")) return INVALID;
  if (body !== text) return makeDatum("set-path", items);
  // A lit-word at the start makes a lit-path. The first item becomes a word.
  return items[0].type === "lit-word"
    ? makeDatum("lit-path", [makeDatum("word", items[0].value), ...items.slice(1)])
    : makeDatum("path", items);
};

/**
 * @uses readInteger, readDecimal, readPair, readTuple, readTime, makeDatum, readFile, WORD, readPath
 * @usedby readRun
 */
const RUN_READERS = [
  [/^[+-]?\d[\d']*$/, readInteger],
  [/^[+-]?(?:\d[\d']*[.,]\d*|[.,]\d+|\d[\d']*(?=[eE]))(?:[eE][+-]?\d+)?$/, readDecimal],
  [/^[+-]?\d+[xX][+-]?\d+$/, readPair],
  [/^\d+(?:\.\d+){2,}$/, readTuple],
  [/^[+-]?\d*:\d+(?::\d+(?:[.,]\d*)?)?$/, readTime],
  [/^#/, (text) => makeDatum("issue", text.slice(1))],
  [/^%/, readFile],
  [/^\/[^/]+$/, (text) => makeDatum("refinement", text.slice(1))],
  [/^(?:<|>|<=|>=|<>|\/+)$/, (text) => makeDatum("word", text)],
  [new RegExp(`^${WORD}$`), (text) => makeDatum("word", text)],
  [new RegExp(`^${WORD}:$`), (text) => makeDatum("set-word", text.slice(0, -1))],
  [new RegExp(`^:${WORD}$`), (text) => makeDatum("get-word", text.slice(1))],
  [new RegExp(`^'${WORD}$`), (text) => makeDatum("lit-word", text.slice(1))],
  [/^[^@:/<>]+@[^@]*$/, (text) => makeDatum("email", text)],
  [/^[A-Za-z][A-Za-z0-9.+-]*:\S+$/, (text) => makeDatum("url", text)],
  [/^[^/].*\//, readPath],
];

/**
 * @uses RUN_READERS, INVALID
 * @usedby readPath, TOKEN_READERS
 */
const readRun = (text) => {
  // The first pattern that agrees with the text gives the reader.
  const entry = RUN_READERS.find(([pattern]) => pattern.test(text));
  return entry === undefined ? INVALID : entry[1](text);
};

/**
 * @uses BINARY_BASES, INVALID, makeDatum
 * @usedby TOKEN_READERS
 */
const readBinary = (text) => {
  // Find the base and the digits. Spaces between the digits have no meaning.
  const [, base = "16", body] = text.match(/^(\d*)#\{([^}]*)\}$/).map((part) => (part === "" ? undefined : part));
  const digits = (body ?? "").replace(/\s/g, "");
  const width = BINARY_BASES[base];
  // Each group of digits must make one full byte.
  if (width === undefined || digits.length % width !== 0 || /[^0-9A-Fa-f]/.test(digits)) return INVALID;
  const groups = digits.match(new RegExp(`.{${width}}`, "g")) ?? [];
  return makeDatum("binary", groups.map((group) => parseInt(group, Number(base))));
};

/**
 * @uses CONSTRUCTS, INVALID, makeDatum
 * @usedby TOKEN_READERS
 */
const readConstruct = (text) =>
  CONSTRUCTS[text] === undefined ? INVALID : makeDatum(...CONSTRUCTS[text]);

/**
 * @uses makeDatum, unescapeText, readBinary, readConstruct, readRun, INVALID
 * @usedby readToken
 */
const TOKEN_READERS = {
  char: (text) => makeDatum("char", unescapeText(text.slice(2, -1)).charCodeAt(0)),
  binary: readBinary,
  construct: readConstruct,
  quotedFile: (text) => makeDatum("file", text.slice(2, -1)),
  string: (text) => makeDatum("string", unescapeText(text.slice(1, -1))),
  braces: (text) => makeDatum("string", unescapeText(text.slice(1, -1))),
  tag: (text) => makeDatum("tag", text.slice(1, -1)),
  run: readRun,
  invalid: () => INVALID,
};

/**
 * Reads the REBOL value that one token shows.
 * @param {Token} token - A token that is not a bracket.
 * @returns {Datum}
 * @standard invalid - A token that shows no REBOL value gives an error datum with the text "syntax invalid".
 * @uses TOKEN_READERS
 * @usedby addToken
 */
export const readToken = (token) => TOKEN_READERS[token.kind](token.text);
