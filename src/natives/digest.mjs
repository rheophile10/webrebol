/** @import { Datum, Store } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { readRest } from "../store/store.mjs";
import { askEdge, failMachine, giveValue } from "../machine/machine.mjs";
import { giveNew } from "./series.mjs";

const CRC_MASK = 0xffffff;
const CRC_POLYNOMIAL = 0x1864cfb;
const SHIFTS = [[7, 12, 17, 22], [5, 9, 14, 20], [4, 11, 16, 23], [6, 10, 15, 21]];
const START = [0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476];

/**
 * @usedby SINES, CRC_TABLE, countTcp, mixBlock, hashMd5
 */
const countUp = (size) => Array.from({ length: Math.max(size, 0) });

/**
 * @uses countUp
 * @usedby mixStep
 */
const SINES = countUp(64).map((unused, place) => Math.floor(Math.abs(Math.sin(place + 1)) * 2 ** 32) | 0);

/**
 * @uses CRC_POLYNOMIAL
 * @usedby CRC_TABLE
 */
const shiftBit = (value) => ((value << 1) & 0x1000000 ? (value << 1) ^ CRC_POLYNOMIAL : value << 1);

/**
 * @uses countUp, shiftBit, CRC_MASK
 * @usedby countCrc
 */
const CRC_TABLE = countUp(256).map((unused, place) => countUp(8).reduce(shiftBit, place << 16) & CRC_MASK);

/**
 * Gets the bytes of a text or of a binary.
 * @param {Store} store
 * @param {Datum} value
 * @returns {number[]}
 * @uses readRest (src/store/store.mjs)
 * @usedby checkBytes, makeBytes
 */
export const readBytes = (store, value) =>
  value.type === "binary" ? readRest(store, value) : [...readRest(store, value)].map((char) => char.charCodeAt(0) & 255);

/**
 * Calculates the usual checksum of REBOL: a CRC of 24 bits that starts with the length and the first byte.
 * @param {number[]} bytes
 * @returns {number}
 * @standard reference - The bytes of "abc" give 1664899, as in REBOL 2.7.8.
 * @keypoint The algorithm is the algorithm of the open source of REBOL 3 (Apache-2.0).
 * @uses CRC_MASK, CRC_TABLE
 * @usedby checkBytes
 */
export const countCrc = (bytes) => {
  const addByte = (crc, byte) => ((crc << 8) & CRC_MASK) ^ CRC_TABLE[((crc >> 16) ^ byte) & 255];
  return bytes.reduce(addByte, bytes.length + (bytes[0] ?? 0));
};

/**
 * @uses countUp
 * @usedby checkBytes
 */
const countTcp = (bytes) => {
  // Add the bytes as words of 16 bits. A last byte without a partner is a small word.
  const words = countUp(Math.ceil(bytes.length / 2)).map((unused, place) =>
    bytes[place * 2 + 1] === undefined ? bytes[place * 2] : (bytes[place * 2] << 8) | bytes[place * 2 + 1],
  );
  const sum = words.reduce((total, word) => total + word, 0);
  const folded = countUp(2).reduce((total) => (total & 0xffff) + (total >> 16), sum);
  return ~folded & 0xffff;
};

const MIXERS = [
  (left, middle, right) => (left & middle) | (~left & right),
  (left, middle, right) => (right & left) | (~right & middle),
  (left, middle, right) => left ^ middle ^ right,
  (left, middle, right) => middle ^ (left | ~right),
];

const WORD_PLACES = [(step) => step, (step) => (5 * step + 1) % 16, (step) => (3 * step + 5) % 16, (step) => (7 * step) % 16];

/**
 * @usedby mixStep
 */
const rotate = (value, bits) => (value << bits) | (value >>> (32 - bits));

/**
 * @uses MIXERS, SINES, WORD_PLACES, rotate, SHIFTS
 * @usedby mixBlock
 */
const mixStep = (words) => (state, unused, step) => {
  // One of the 64 steps of the MD5 algorithm (RFC 1321).
  const round = Math.floor(step / 16);
  const [first, second, third, fourth] = state;
  const sum = (first + MIXERS[round](second, third, fourth) + SINES[step] + words[WORD_PLACES[round](step)]) | 0;
  return [fourth, (second + rotate(sum, SHIFTS[round][step % 4])) | 0, second, third];
};

/**
 * @uses countUp, mixStep
 * @usedby hashMd5
 */
const mixBlock = (state, block) => {
  const words = countUp(16).map((unused, place) => block.slice(place * 4, place * 4 + 4).reduce((word, byte, index) => word | (byte << (8 * index)), 0));
  const mixed = countUp(64).reduce(mixStep(words), state);
  return state.map((part, place) => (part + mixed[place]) | 0);
};

/**
 * Calculates the MD5 digest of bytes.
 * @param {number[]} bytes
 * @returns {number[]}
 * @standard reference - The bytes of "abc" give the digest 900150983CD24FB0D6963F7D28E17F72.
 * @uses countUp, mixBlock, START
 * @usedby checkBytes
 */
export const hashMd5 = (bytes) => {
  // Add the end mark, the zeros, and the length in bits, so that the size is a multiple of 64 bytes.
  const zeros = (119 - (bytes.length % 64)) % 64;
  const size = countUp(8).map((unused, place) => Math.floor((bytes.length * 8) / 2 ** (8 * place)) & 255);
  const padded = [...bytes, 0x80, ...countUp(zeros).map(() => 0), ...size];
  const blocks = countUp(padded.length / 64).map((unused, place) => padded.slice(place * 64, place * 64 + 64));
  return blocks.reduce(mixBlock, START).flatMap((part) => countUp(4).map((unused, place) => (part >>> (8 * place)) & 255));
};

/**
 * @uses giveNew, askEdge (src/machine/machine.mjs)
 * @usedby checkBytes
 */
const askDigest = (machine, bytes, key) => {
  // SHA-1 is the work of the Web Crypto of the edge. The answer is the list of the bytes of the digest.
  const resume = (waiting, answer) => giveNew(waiting, "binary", answer);
  return askEdge(machine, { kind: "digest", bytes, key, resume });
};

/**
 * @uses readBytes, giveNew, hashMd5, askDigest, giveValue (src/machine/machine.mjs), makeDatum (src/data/datum.mjs),
 *   countTcp, failMachine (src/machine/machine.mjs), countCrc
 * @usedby DIGEST_NATIVES
 */
const checkBytes = (machine, [value], options) => {
  // Without a refinement, the result is the CRC. With /secure, /key or the method sha1, it is a SHA-1 digest.
  const bytes = readBytes(machine.store, value);
  const method = options.$method === undefined ? null : String(options.$method[0].value).toLowerCase();
  const key = options.$key === undefined ? null : readBytes(machine.store, options.$key[0]);
  if (method === "md5" && key === null) return giveNew(machine, "binary", hashMd5(bytes));
  if (method === "sha1" || options.$secure !== undefined || key !== null) return askDigest(machine, bytes, key);
  if (options.$tcp !== undefined) return giveValue(machine, makeDatum("integer", countTcp(bytes)));
  // TODO: checksum/hash, and a key with the method md5.
  if (method !== null || options.$hash !== undefined) return failMachine(machine, "script invalid-arg", [value]);
  return giveValue(machine, makeDatum("integer", countCrc(bytes)));
};

/**
 * The checksum native. The entry has the name of REBOL and the function.
 * @uses checkBytes
 * @usedby NATIVES
 */
export const DIGEST_NATIVES = {
  checksum: checkBytes,
};
