import { NONE, isList, makeSeries, readAll, readRest, writeAll } from "../store/store.mjs";
import { formValue } from "../store/mold.mjs";
import { failMachine, giveValue, makeLogic } from "../machine/machine.mjs";
import { giveNew } from "./series.mjs";

const TAB_SIZE = 4;
const BASE_64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const WIDTHS = { 2: 8, 16: 2 };

/**
 * @usedby encodeGroup, encode64, decode64, buildTag
 */
const countUp = (size) => Array.from({ length: Math.max(size, 0) });

/**
 * @uses readRest (src/store/store.mjs)
 * @usedby encodeBase, testCodes
 */
const readBytes = (store, value) =>
  value.type === "binary" ? readRest(store, value) : [...readRest(store, value)].map((char) => char.charCodeAt(0) & 255);

/**
 * @uses countUp, BASE_64
 * @usedby encode64
 */
const encodeGroup = (bytes) => {
  // Three bytes give four characters. A group that is not full gets "=" at its end.
  const bits = bytes.reduce((sum, byte, place) => sum | (byte << (16 - 8 * place)), 0);
  const signs = countUp(4).map((unused, place) => BASE_64[(bits >> (18 - 6 * place)) & 63]);
  return signs.slice(0, bytes.length + 1).join("").padEnd(4, "=");
};

/**
 * @uses countUp, encodeGroup
 * @usedby encodeBase
 */
const encode64 = (bytes) =>
  countUp(Math.ceil(bytes.length / 3))
    .map((unused, place) => encodeGroup(bytes.slice(place * 3, place * 3 + 3)))
    .join("");

/**
 * @uses BASE_64, countUp
 * @usedby decodeBase
 */
const decode64 = (text) => {
  // Each character gives 6 bits. Each full group of 8 bits is a byte.
  const signs = [...text.replace(/[^A-Za-z0-9+/]/g, "")].map((sign) => BASE_64.indexOf(sign));
  const bits = signs.map((sign) => sign.toString(2).padStart(6, "0")).join("");
  return countUp(Math.floor(bits.length / 8)).map((unused, place) => parseInt(bits.slice(place * 8, place * 8 + 8), 2));
};

/**
 * @usedby encodeBase, decodeBase
 */
const readBase = (options) => (options.$base === undefined ? 64 : options.$base[0].value);

/**
 * @uses readBytes, readBase, encode64, WIDTHS, giveNew
 * @usedby ENCODE_NATIVES
 */
const encodeBase = (machine, [value], options) => {
  const bytes = readBytes(machine.store, value);
  const base = readBase(options);
  const text = base === 64 ? encode64(bytes) : bytes.map((byte) => byte.toString(base).toUpperCase().padStart(WIDTHS[base], "0")).join("");
  return giveNew(machine, "string", text);
};

/**
 * @uses readRest (src/store/store.mjs), readBase, giveNew, decode64, WIDTHS
 * @usedby ENCODE_NATIVES
 */
const decodeBase = (machine, [value], options) => {
  const text = readRest(machine.store, value);
  const base = readBase(options);
  if (base === 64) return giveNew(machine, "binary", decode64(text));
  const groups = text.match(new RegExp(`.{${WIDTHS[base]}}`, "g")) ?? [];
  return giveNew(machine, "binary", groups.map((group) => parseInt(group, base)));
};

/**
 * @uses readAll (src/store/store.mjs), readRest (src/store/store.mjs), giveValue (src/machine/machine.mjs),
 *   writeAll (src/store/store.mjs)
 * @usedby ENCODE_NATIVES
 */
const changeText = (change) => (machine, [series], options) => {
  // The text of the series changes from its position. The result is the series.
  const head = readAll(machine.store, series).slice(0, series.value.index);
  const text = change(readRest(machine.store, series), options);
  return giveValue({ ...machine, store: writeAll(machine.store, series, head + text) }, series);
};

/**
 * @uses TAB_SIZE
 * @usedby removeTabs, addTabs
 */
const readSize = (options) => (options.$size === undefined ? TAB_SIZE : options.$size[0].value);

/**
 * @uses readSize
 * @usedby ENCODE_NATIVES
 */
const removeTabs = (text, options) => {
  // A tab becomes the spaces that go to the next tab position of its line.
  const size = readSize(options);
  const addCharacter = (line, character) => (character === "\t" ? line + " ".repeat(size - (line.length % size)) : line + character);
  return text.split("\n").map((line) => [...line].reduce(addCharacter, "")).join("\n");
};

/**
 * @uses readSize
 * @usedby ENCODE_NATIVES
 */
const addTabs = (text, options) => {
  // The spaces at the start of each line become tabs.
  const size = readSize(options);
  const tabLine = (line) => {
    const spaces = line.length - line.trimStart().length;
    return "\t".repeat(Math.floor(spaces / size)) + " ".repeat(spaces % size) + line.trimStart();
  };
  return text.split("\n").map(tabLine).join("\n");
};

/**
 * @uses giveNew, readRest (src/store/store.mjs)
 * @usedby ENCODE_NATIVES
 */
const decodeHex = (machine, [value]) => {
  const decode = (code, digits) => String.fromCharCode(parseInt(digits, 16));
  return giveNew(machine, "string", readRest(machine.store, value).replace(/%([0-9A-Fa-f]{2})/g, decode));
};

/**
 * @uses giveValue (src/machine/machine.mjs), makeLogic (src/machine/machine.mjs), readBytes
 * @usedby ENCODE_NATIVES
 */
const testCodes = (limit) => (machine, [value]) =>
  giveValue(machine, makeLogic(readBytes(machine.store, value).every((code) => code < limit)));

/**
 * @uses giveNew
 * @usedby findSuffix, ENCODE_NATIVES
 */
const giveFile = (machine, text) => giveNew(machine, "file", text);

/**
 * @uses readRest (src/store/store.mjs), makeSeries (src/store/store.mjs), NONE (src/store/store.mjs), giveNew
 * @usedby ENCODE_NATIVES
 */
const splitPath = (machine, [target]) => {
  // The last part of the path is the file. The parts before it are the directory.
  const path = readRest(machine.store, target);
  const cut = path.replace(/\/$/, "").lastIndexOf("/") + 1;
  const directory = makeSeries(machine.store, "file", cut === 0 && path !== "/" ? "./" : path.slice(0, cut) || "/");
  const name = path === "/" ? { store: directory.store, value: NONE } : makeSeries(directory.store, "file", path.slice(cut));
  return giveNew({ ...machine, store: name.store }, "block", [directory.value, name.value]);
};

/**
 * @uses readRest (src/store/store.mjs), giveValue (src/machine/machine.mjs), NONE (src/store/store.mjs), giveFile
 * @usedby ENCODE_NATIVES
 */
const findSuffix = (machine, [target]) => {
  // The suffix starts at the last point of the last part of the path.
  const name = readRest(machine.store, target).split("/").slice(-1)[0];
  const point = name.lastIndexOf(".");
  return point < 0 ? giveValue(machine, NONE) : giveFile(machine, name.slice(point));
};

/**
 * @uses readRest (src/store/store.mjs), isList (src/store/store.mjs), formValue (src/store/mold.mjs), countUp,
 *   giveNew
 * @usedby ENCODE_NATIVES
 */
const buildTag = (machine, [block]) => {
  // The first value is the name of the tag. After it, each name has a value that goes in quotation marks.
  const texts = readRest(machine.store, block).map((item) => (isList(item) ? "" : formValue(machine.store, item).replace(/^%/, "")));
  const pairs = countUp(Math.floor((texts.length - 1) / 2)).map((unused, place) => `${texts[1 + place * 2]}="${texts[2 + place * 2]}"`);
  return giveNew(machine, "tag", [texts[0], ...pairs].join(" "));
};

/**
 * @uses failMachine (src/machine/machine.mjs), giveNew
 * @usedby ENCODE_NATIVES
 */
const toHex = (machine, [number]) => {
  // The result is an issue of 8 digits. A negative number shows as its 32 bits.
  if (number.type !== "integer") return failMachine(machine, "script invalid-arg", [number]);
  return giveNew(machine, "issue", (number.value >>> 0).toString(16).toUpperCase().padStart(8, "0"));
};

/**
 * The natives that change the form of a text or of bytes. Each entry has the name of REBOL and the function.
 * @uses encodeBase, decodeBase, changeText, removeTabs, addTabs, decodeHex, testCodes, splitPath, findSuffix,
 *   giveFile, readRest (src/store/store.mjs), buildTag, toHex
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const ENCODE_NATIVES = {
  enbase: encodeBase,
  debase: decodeBase,
  detab: changeText(removeTabs),
  entab: changeText(addTabs),
  deline: changeText((text) => text.replace(/\r\n?/g, "\n")),
  enline: changeText((text) => text),
  dehex: decodeHex,
  "ascii?": testCodes(128),
  "latin1?": testCodes(256),
  "split-path": splitPath,
  "suffix?": findSuffix,
  dirize: (machine, [path]) => giveFile(machine, readRest(machine.store, path).replace(/\/?$/, "/")),
  undirize: (machine, [path]) => giveFile(machine, readRest(machine.store, path).replace(/\/$/, "")),
  "build-tag": buildTag,
  "to-hex": toHex,
};
