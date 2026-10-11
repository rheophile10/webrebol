import { NONE, isList, makeSeries, readRest } from "../store/store.mjs";
import { askEdge, failMachine, giveValue, makeLogic } from "../machine/machine.mjs";
import { readBytes } from "./digest.mjs";

const METHODS = { sha1: "SHA-1", sha256: "SHA-256", sha384: "SHA-384", sha512: "SHA-512" };

/**
 * @uses giveValue (src/machine/machine.mjs), NONE (src/store/store.mjs), makeLogic (src/machine/machine.mjs),
 *   makeSeries (src/store/store.mjs)
 * @usedby askCrypto
 */
const giveAnswer = (machine, answer) => {
  // The edge gives bytes, a text, a truth value, a list of texts, or null when the work is not possible.
  if (answer === null) return giveValue(machine, NONE);
  if (typeof answer === "boolean") return giveValue(machine, makeLogic(answer));
  const made = typeof answer === "string" ? makeSeries(machine.store, "string", answer) : makeSeries(machine.store, "binary", answer);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses makeSeries (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby askCrypto
 */
const giveTexts = (machine, texts) => {
  const addText = (made, text) => {
    const next = makeSeries(made.store, "string", text);
    return { store: next.store, values: [...made.values, next.value] };
  };
  const strings = texts.reduce(addText, { store: machine.store, values: [] });
  const made = makeSeries(strings.store, "block", strings.values);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses askEdge (src/machine/machine.mjs), giveTexts, giveAnswer
 * @usedby digestData, signWithKey, deriveKey, useKey, useText, verifyData, CRYPTO_NATIVES
 */
const askCrypto = (machine, work) =>
  // Web Crypto gives its answer later. Thus the machine waits for the edge.
  askEdge(machine, { ...work, kind: "crypto", resume: (waiting, answer) => (Array.isArray(answer) && typeof answer[0] === "string" ? giveTexts(waiting, answer) : giveAnswer(waiting, answer)) });

/**
 * @uses METHODS
 * @usedby digestData, signWithKey
 */
const readMethod = (machine, word) => METHODS[String(word?.value ?? "sha256").toLowerCase().replace("-", "")];

/**
 * @uses isList (src/store/store.mjs), readBytes
 * @usedby digestData, signWithKey, deriveKey, useKey, useText, verifyData
 */
const readData = (machine, value) => (isList(value) ? [] : readBytes(machine.store, value));

/**
 * @uses readMethod, failMachine (src/machine/machine.mjs), askCrypto, readData
 * @usedby CRYPTO_NATIVES
 */
const digestData = (machine, [data, word]) => {
  const method = readMethod(machine, word);
  return method === undefined ? failMachine(machine, "script invalid-arg", [word]) : askCrypto(machine, { work: "digest", method, data: readData(machine, data) });
};

/**
 * @uses readMethod, failMachine (src/machine/machine.mjs), askCrypto, readData
 * @usedby CRYPTO_NATIVES
 */
const signWithKey = (machine, [data, key], options) => {
  // An HMAC with SHA-256, or with the method of the refinement.
  const method = readMethod(machine, options.$method?.[0]);
  if (method === undefined) return failMachine(machine, "script invalid-arg", [options.$method[0]]);
  return askCrypto(machine, { work: "hmac", method, data: readData(machine, data), key: readData(machine, key) });
};

/**
 * @uses askCrypto, readData
 * @usedby CRYPTO_NATIVES
 */
const deriveKey = (machine, [passphrase, salt, rounds]) =>
  askCrypto(machine, { work: "derive", data: readData(machine, passphrase), salt: readData(machine, salt), rounds: rounds.value });

/**
 * @uses askCrypto, readData
 * @usedby CRYPTO_NATIVES
 */
const useKey = (work) => (machine, [data, key]) => askCrypto(machine, { work, data: readData(machine, data), key: readData(machine, key) });

/**
 * @uses askCrypto, readData, readRest (src/store/store.mjs)
 * @usedby CRYPTO_NATIVES
 */
const useText = (work) => (machine, [data, key]) =>
  askCrypto(machine, { work, data: readData(machine, data), key: readRest(machine.store, key) });

/**
 * @uses askCrypto, readData, readRest (src/store/store.mjs)
 * @usedby CRYPTO_NATIVES
 */
const verifyData = (machine, [data, signature, key]) =>
  askCrypto(machine, { work: "verify", data: readData(machine, data), signature: readData(machine, signature), key: readRest(machine.store, key) });

/**
 * The crypto words: the natives that use Web Crypto through the edge. These words are not in REBOL 2.
 * @uses digestData, askCrypto, signWithKey, deriveKey, useKey, useText, verifyData
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const CRYPTO_NATIVES = {
  "crypto-digest": digestData,
  "crypto-random": (machine, [size]) => askCrypto(machine, { work: "random", size: Math.max(0, Math.min(size.value, 65536)) }),
  "crypto-hmac": signWithKey,
  "crypto-derive": deriveKey,
  "crypto-encrypt": useKey("encrypt"),
  "crypto-decrypt": useKey("decrypt"),
  "crypto-key-pair": (machine) => askCrypto(machine, { work: "keypair" }),
  "crypto-sign": useText("sign"),
  "crypto-verify": verifyData,
  "crypto-uuid": (machine) => askCrypto(machine, { work: "uuid" }),
};

/**
 * The parameters of the crypto words, as REBOL text.
 */
export const CRYPTO_SPECS = {
  "crypto-digest": ["native", "data [any-string! binary!] method [word!]"],
  "crypto-random": ["native", "size [integer!]"],
  "crypto-hmac": ["native", "data [any-string! binary!] key [any-string! binary!] /method name [word!]"],
  "crypto-derive": ["native", "passphrase [any-string! binary!] salt [any-string! binary!] rounds [integer!]"],
  "crypto-encrypt": ["native", "data [any-string! binary!] key [binary!]"],
  "crypto-decrypt": ["native", "data [binary!] key [binary!]"],
  "crypto-key-pair": ["native", ""],
  "crypto-sign": ["native", "data [any-string! binary!] private-key [string!]"],
  "crypto-verify": ["native", "data [any-string! binary!] signature [binary!] public-key [string!]"],
  "crypto-uuid": ["native", ""],
};
