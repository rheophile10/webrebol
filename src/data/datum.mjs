/** @import { Datatype } from "../types/categories.mjs" */
/** @import { Token } from "../types/results.mjs" */
/** @import { Datum } from "../types/states.mjs" */
import { unescapeText } from "./escape.mjs";
import { countDays, makeDate, readDays } from "./dates.mjs";

const INTEGER_LIMIT = 2147483648;
const NANOSECONDS = 1e9;
const WORD = "[A-Za-z?!.*&|=_~+\\-^`](?<![+-](?=\\d))[A-Za-z0-9?!.*&|=_~+\\-^`']*";
const BINARY_BASES = { 2: 8, 16: 2 };
const BASE_64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const SIMPLE_CONSTRUCTS = { true: ["logic", true], false: ["logic", false], none: ["none", null], "unset!": ["unset", null] };
const SERIES_CONSTRUCTS = ["string", "file", "email", "url", "tag", "issue", "binary", "block", "paren", "path", "set-path", "lit-path"];

/**
 * Makes a datum from a type and its data.
 * @param {Datatype} type
 * @param {Datum["value"]} value - The data of the value.
 * @returns {Datum}
 * @usedby 108 declarations in datum, load, machine, path, bitsets, clock, compare, control, convert, digest, faults, files, items, loops, math, numbers, objects, parse, random, scalars, series, words, globals, parts, store, grid, layout, windows
 */
export const makeDatum = (type, value) => ({ type, value });

/**
 * @uses makeDatum
 * @usedby 9 declarations in datum
 */
const INVALID = makeDatum("error", "syntax invalid");

/**
 * @usedby readInteger, readDecimal, readMoney
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
 * @uses makeDatum, readNumber
 * @usedby RUN_READERS
 */
const readMoney = (text) => {
  // A money value has an optional sign, an optional currency of 3 letters, and an amount.
  const [, sign, code, amount] = text.match(/^([+-]?)([A-Za-z]{0,3})\$(.*)$/);
  return makeDatum("money", { code: code.toUpperCase(), amount: (sign === "-" ? -1 : 1) * readNumber(amount) });
};

const MONTH_NAMES = [
  ...["january", "february", "march", "april", "may", "june"],
  ...["july", "august", "september", "october", "november", "december"],
];

/**
 * @uses MONTH_NAMES
 * @usedby readDateParts
 */
const readMonth = (text) => {
  // A month is a number, or the first 3 or more letters of its name.
  if (/^\d+$/.test(text)) return Number(text);
  return MONTH_NAMES.findIndex((name) => name.startsWith(text.toLowerCase())) + 1;
};

/**
 * @uses NANOSECONDS
 * @usedby readDate
 */
const readClock = (text) => {
  // The time of a date can have a time zone after it.
  const match = text.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?(?:([+-])(\d{1,2}):(\d{2}))?$/);
  if (match === null || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  const time = Math.round((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0)) * NANOSECONDS);
  const zone = (match[4] === "-" ? -1 : 1) * (Number(match[5] ?? 0) * 3600 + Number(match[6] ?? 0) * 60) * NANOSECONDS;
  return { time, zone };
};

/**
 * @uses readMonth
 * @usedby readDate
 */
const readDateParts = (text) => {
  // The year is first if it has 4 digits. If not, the day is first.
  const [first, middle, last] = text.split(/[-/]/);
  const yearFirst = first.length === 4;
  const year = Number(yearFirst ? first : last);
  const full = !yearFirst && last.length <= 2 ? year + 2000 : year;
  return { year: full, month: readMonth(middle), day: Number(yearFirst ? last : first) };
};

/**
 * @uses readDateParts, countDays, readDays, readClock, makeDatum, makeDate, INVALID
 * @usedby RUN_READERS
 */
const readDate = (text) => {
  // TODO: REBOL selects the century of a year of 2 digits from the current year. WebRebol adds 2000.
  const [, date, clock] = text.match(/^(\d+[-/][A-Za-z0-9]+[-/]\d+)(?:\/(.*))?$/);
  const parts = readDateParts(date);
  const days = countDays(parts.year, parts.month, parts.day);
  const back = readDays(days);
  // A day that the month does not have is not valid.
  const valid = parts.month >= 1 && parts.day >= 1 && back.month === parts.month && back.day === parts.day;
  const time = clock === undefined ? { time: null, zone: 0 } : readClock(clock);
  return valid && time !== null ? makeDatum("date", makeDate(days, time.time, time.zone)) : INVALID;
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
  // A backslash in a file name is a slash.
  text === "%" ? INVALID : makeDatum("file", text.slice(1).replace(/\\/g, "/").replace(/%([0-9A-Fa-f]{2})/g, decodeHex));

/**
 * @uses readRun, INVALID, makeDatum
 * @usedby RUN_READERS
 */
const readPath = (text) => {
  // A colon at the end makes a set-path.
  const body = text.endsWith(":") ? text.slice(0, -1) : text;
  const items = body.split("/").map(readRun);
  // A path is invalid if one of its parts is invalid, or if it does not start with a word.
  if (items.some((item) => item.type === "error") || typeof items[0].value !== "string") return INVALID;
  if (body !== text) return makeDatum("set-path", items);
  // A lit-word at the start makes a lit-path. The first item becomes a word.
  return items[0].type === "lit-word"
    ? makeDatum("lit-path", [makeDatum("word", items[0].value), ...items.slice(1)])
    : makeDatum("path", items);
};

/**
 * @uses readInteger, readDecimal, readPair, readTuple, readTime, readMoney, readDate, makeDatum, readFile, WORD,
 *   readPath
 * @usedby readRun
 */
const RUN_READERS = [
  [/^[+-]?\d[\d']*$/, readInteger],
  [/^[+-]?(?:\d[\d']*[.,]\d*|[.,]\d+|\d[\d']*(?=[eE]))(?:[eE][+-]?\d+)?$/, readDecimal],
  [/^[+-]?\d+[xX][+-]?\d+$/, readPair],
  [/^\d+(?:\.\d+){2,}$/, readTuple],
  [/^[+-]?\d*:\d+(?::\d+(?:[.,]\d*)?)?$/, readTime],
  [/^[+-]?[A-Za-z]{0,3}\$\d[\d']*(?:[.,]\d*)?$/, readMoney],
  [/^\d{1,4}[-/](?:\d{1,2}|[A-Za-z]{3,9})[-/]\d{1,4}(?:\/.*)?$/, readDate],
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

const GUESSES = [
  [/^[+-]?\d[\d']*[A-Za-z]*$/, "integer"],
  [/^\d+(?:\.\d+){2,}/, "tuple"],
  [/^[+-]?\d+[-/]/, "date"],
  [/^[+-]?\d*:/, "time"],
  [/^[+-]?[\d.,]+/, "decimal"],
  [/\$/, "money"],
  [/@/, "email"],
  [/[<>]/, "tag"],
  [/^%/, "file"],
  [/\//, "path"],
];

/**
 * @uses GUESSES, INVALID
 * @usedby readRun
 */
const makeInvalid = (text) => {
  // The error names the type that the text is most similar to, as REBOL does.
  const guess = GUESSES.find(([pattern]) => pattern.test(text));
  return { ...INVALID, args: [guess === undefined ? "word" : guess[1], text] };
};

/**
 * @uses RUN_READERS, INVALID, makeInvalid
 * @usedby readPath, TOKEN_READERS
 */
const readRun = (text) => {
  // The first pattern that agrees with the text gives the reader.
  const entry = RUN_READERS.find(([pattern]) => pattern.test(text));
  const datum = entry === undefined ? INVALID : entry[1](text);
  return datum === INVALID ? makeInvalid(text) : datum;
};

/**
 * @uses BASE_64
 * @usedby readBinary
 */
const decode64 = (text) => {
  // Each character gives 6 bits. Each full group of 8 bits is a byte.
  const bits = [...text.replace(/[^A-Za-z0-9+/]/g, "")].map((sign) => BASE_64.indexOf(sign).toString(2).padStart(6, "0")).join("");
  return Array.from({ length: Math.floor(bits.length / 8) }, (unused, place) => parseInt(bits.slice(place * 8, place * 8 + 8), 2));
};

/**
 * @uses makeDatum, decode64, BINARY_BASES, INVALID
 * @usedby TOKEN_READERS
 */
const readBinary = (text) => {
  // Find the base and the digits. Spaces between the digits have no meaning.
  const [, base = "16", body] = text.match(/^(\d*)#\{([^}]*)\}$/).map((part) => (part === "" ? undefined : part));
  const digits = (body ?? "").replace(/\s/g, "");
  if (base === "64") return makeDatum("binary", decode64(digits));
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
/**
 * @uses makeDatum, unescapeText, readBinary, readRun, INVALID
 * @usedby readToken
 */
const TOKEN_READERS = {
  char: (text) => makeDatum("char", unescapeText(text.slice(2, -1)).charCodeAt(0)),
  binary: readBinary,
  quotedFile: (text) => makeDatum("file", text.slice(2, -1)),
  string: (text) => makeDatum("string", unescapeText(text.slice(1, -1))),
  braces: (text) => makeDatum("string", unescapeText(text.slice(1, -1))),
  tag: (text) => makeDatum("tag", text.slice(1, -1)),
  run: readRun,
  invalid: (text) => ({ ...INVALID, args: ["string", text] }),
};

/**
 * Makes an image value from its size, the bytes of its colors, and the bytes of its alpha values.
 * @param {number[]} size - The width and the height.
 * @param {number[]} colors - Three bytes for each pixel: red, green and blue. Absent bytes are zero.
 * @param {number[]} alphas - One byte for each pixel. Absent bytes are zero.
 * @returns {Datum}
 * @standard pixels - Each pixel is a list of four bytes: red, green, blue and alpha.
 * @uses makeDatum
 * @usedby makeConstruct, giveImage (src/natives/objects.mjs)
 */
export const makeImage = (size, colors, alphas) => {
  const count = Math.max(size[0], 0) * Math.max(size[1], 0);
  const readPixel = (unused, place) => [colors[place * 3] ?? 0, colors[place * 3 + 1] ?? 0, colors[place * 3 + 2] ?? 0, alphas[place] ?? 0];
  return { ...makeDatum("image", Array.from({ length: count }, readPixel)), size };
};

/**
 * Makes the value of a construct: the values between "#[" and "]" in a source text.
 * @param {Datum[]} items - The loaded values of the construct.
 * @returns {Datum}
 * @standard series - A series construct can have a position after its content, counted from 1.
 * @uses SIMPLE_CONSTRUCTS, makeDatum, makeImage, SERIES_CONSTRUCTS, INVALID
 * @usedby closeFrame
 */
export const makeConstruct = (items) => {
  const name = typeof items[0]?.value === "string" ? items[0].value.toLowerCase() : "";
  if (SIMPLE_CONSTRUCTS[name] !== undefined && items.length === 1) return makeDatum(...SIMPLE_CONSTRUCTS[name]);
  if (name === "datatype!" && items.length === 2) return makeDatum("datatype", String(items[1].value).toLowerCase().replace(/!$/, ""));
  const type = name.replace(/!$/, "");
  const content = items[1]?.value;
  if (type === "bitset" && items[1]?.type === "binary") return makeDatum("bitset", content);
  if (type === "image" && items[1]?.type === "pair") return makeImage(items[1].value, items[2]?.value ?? [], items[3]?.value ?? []);
  const fits = SERIES_CONSTRUCTS.includes(type) && (Array.isArray(content) || typeof content === "string");
  if (!fits) return { ...INVALID, args: ["construct", name] };
  return items[2] === undefined ? makeDatum(type, content) : { ...makeDatum(type, content), index: items[2].value - 1 };
};

/**
 * Reads the REBOL value that one token shows.
 * @param {Token} token - A token that is not a bracket.
 * @returns {Datum}
 * @standard invalid - A token that shows no REBOL value gives an error datum with the text "syntax invalid". Its fields are a type name and the text of the token.
 * @uses TOKEN_READERS
 * @usedby addToken, readParts, startPath
 */
export const readToken = (token) => TOKEN_READERS[token.kind](token.text);
