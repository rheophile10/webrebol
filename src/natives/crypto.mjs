import { NONE, isList, makeSeries, readRest } from "../store/store.mjs";
import { askEdge, failMachine, giveValue, makeLogic } from "../machine/machine.mjs";
import { readBytes } from "./digest.mjs";

const HASHES = { sha1: "SHA-1", sha256: "SHA-256", sha384: "SHA-384", sha512: "SHA-512" };
const CIPHERS = { "aes-gcm": "AES-GCM", "aes-cbc": "AES-CBC", "aes-ctr": "AES-CTR" };
const PAIRS = ["ecdsa", "ecdh", "ed25519", "x25519", "rsa-pss", "rsa-oaep", "rsassa"];
const FORMATS = ["spki", "pkcs8", "raw"];
const KEY_BITS = 256;
const RANDOM_LIMIT = 65536;

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
 * @usedby askWithHash, useCipher, makeKeyPair, agreeOnKey, useWrapper, exportKey, importKey, CRYPTO_NATIVES
 */
const askCrypto = (machine, work) =>
  // Web Crypto gives its answer later. Thus the machine waits for the edge.
  askEdge(machine, { ...work, kind: "crypto", resume: (waiting, answer) => (Array.isArray(answer) && typeof answer[0] === "string" ? giveTexts(waiting, answer) : giveAnswer(waiting, answer)) });

/**
 * @uses isList (src/store/store.mjs), readBytes
 * @usedby deriveKey, expandKey, useCipher, signData, verifyData, useWrapper, importKey, CRYPTO_NATIVES
 */
const readData = (machine, value) => (isList(value) ? [] : readBytes(machine.store, value));

// A key of bytes is a binary value. A key pair has its keys as texts in the JWK form.
/**
 * @uses readBytes, readRest (src/store/store.mjs)
 * @usedby useCipher, signData, verifyData
 */
const readKey = (machine, key) => (key.type === "binary" ? readBytes(machine.store, key) : readRest(machine.store, key));

/**
 * @uses readRest (src/store/store.mjs)
 * @usedby makeKeyPair, importKey
 */
const readNames = (machine, spec) =>
  (spec.type === "block" ? readRest(machine.store, spec) : [spec]).map((item) => String(item.value).toLowerCase());

/**
 * @uses HASHES, failMachine (src/machine/machine.mjs), askCrypto
 * @usedby deriveKey, expandKey, signData, verifyData, CRYPTO_NATIVES
 */
const askWithHash = (machine, options, work) => {
  // The refinement /hash selects the hash. Without it, the hash is SHA-256.
  const method = HASHES[String(options.$hash?.[0].value ?? "sha256").toLowerCase().replace("-", "")];
  return method === undefined ? failMachine(machine, "script invalid-arg", [options.$hash[0]]) : askCrypto(machine, { ...work, method });
};

/**
 * @uses KEY_BITS
 * @usedby deriveKey, expandKey
 */
const readSize = (options) => options.$size?.[0].value ?? KEY_BITS;

/**
 * @uses askWithHash, readData, readSize
 * @usedby CRYPTO_NATIVES
 */
const deriveKey = (machine, [passphrase, salt, rounds], options) =>
  askWithHash(machine, options, { work: "derive", data: readData(machine, passphrase), salt: readData(machine, salt), rounds: rounds.value, size: readSize(options) });

/**
 * @uses askWithHash, readData, readSize
 * @usedby CRYPTO_NATIVES
 */
const expandKey = (machine, [key, salt, info], options) =>
  askWithHash(machine, options, { work: "expand", data: readData(machine, key), salt: readData(machine, salt), info: readData(machine, info), size: readSize(options) });

/**
 * @uses CIPHERS, failMachine (src/machine/machine.mjs), readData, askCrypto, readKey
 * @usedby CRYPTO_NATIVES
 */
const useCipher = (work) => (machine, [data, key], options) => {
  // The refinement /method selects the AES mode. Without it, the mode is AES-GCM. An RSA key does not use the mode.
  const method = CIPHERS[String(options.$method?.[0].value ?? "aes-gcm").toLowerCase()];
  if (method === undefined) return failMachine(machine, "script invalid-arg", [options.$method[0]]);
  const extra = options.$extra === undefined ? null : readData(machine, options.$extra[0]);
  return askCrypto(machine, { work, method, extra, data: readData(machine, data), key: readKey(machine, key) });
};

/**
 * @uses readNames, PAIRS, askCrypto, failMachine (src/machine/machine.mjs)
 * @usedby CRYPTO_NATIVES
 */
const makeKeyPair = (machine, args, options) => {
  const spec = options.$method === undefined ? ["ecdsa"] : readNames(machine, options.$method[0]);
  return PAIRS.includes(spec[0]) ? askCrypto(machine, { work: "keypair", spec }) : failMachine(machine, "script invalid-arg", [options.$method[0]]);
};

/**
 * @uses askWithHash, readData, readKey
 * @usedby CRYPTO_NATIVES
 */
const signData = (machine, [data, key], options) =>
  askWithHash(machine, options, { work: "sign", data: readData(machine, data), key: readKey(machine, key) });

/**
 * @uses askWithHash, readData, readKey
 * @usedby CRYPTO_NATIVES
 */
const verifyData = (machine, [data, signature, key], options) =>
  askWithHash(machine, options, { work: "verify", data: readData(machine, data), signature: readData(machine, signature), key: readKey(machine, key) });

/**
 * @uses askCrypto, readRest (src/store/store.mjs)
 * @usedby CRYPTO_NATIVES
 */
const agreeOnKey = (machine, [key, other], options) =>
  askCrypto(machine, { work: "agree", key: readRest(machine.store, key), other: readRest(machine.store, other), size: options.$size?.[0].value ?? null });

/**
 * @uses askCrypto, readData
 * @usedby CRYPTO_NATIVES
 */
const useWrapper = (work) => (machine, [data, key]) => askCrypto(machine, { work, data: readData(machine, data), key: readData(machine, key) });

/**
 * @uses FORMATS
 * @usedby exportKey, importKey
 */
const readFormat = (word) => FORMATS.find((format) => format === String(word.value).toLowerCase());

/**
 * @uses readFormat, failMachine (src/machine/machine.mjs), askCrypto, readRest (src/store/store.mjs)
 * @usedby CRYPTO_NATIVES
 */
const exportKey = (machine, [key, word]) => {
  const format = readFormat(word);
  return format === undefined ? failMachine(machine, "script invalid-arg", [word]) : askCrypto(machine, { work: "export", format, key: readRest(machine.store, key) });
};

/**
 * @uses readFormat, readNames, PAIRS, failMachine (src/machine/machine.mjs), askCrypto, readData
 * @usedby CRYPTO_NATIVES
 */
const importKey = (machine, [data, word, method]) => {
  const [format, spec] = [readFormat(word), readNames(machine, method)];
  if (format === undefined || !PAIRS.includes(spec[0])) return failMachine(machine, "script invalid-arg", [format === undefined ? word : method]);
  return askCrypto(machine, { work: "import", format, spec, data: readData(machine, data) });
};

/**
 * The crypto words: the natives that use Web Crypto through the edge. These words are not in REBOL 2.
 * @uses askWithHash, readData, askCrypto, RANDOM_LIMIT, signData, deriveKey, expandKey, useCipher, makeKeyPair,
 *   verifyData, agreeOnKey, useWrapper, exportKey, importKey
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const CRYPTO_NATIVES = {
  "crypto-digest": (machine, [data, word]) => askWithHash(machine, { $hash: [word] }, { work: "digest", data: readData(machine, data) }),
  "crypto-random": (machine, [size]) => askCrypto(machine, { work: "random", size: Math.max(0, Math.min(size.value, RANDOM_LIMIT)) }),
  "crypto-uuid": (machine) => askCrypto(machine, { work: "uuid" }),
  "crypto-hmac": signData,
  "crypto-derive": deriveKey,
  "crypto-expand": expandKey,
  "crypto-encrypt": useCipher("encrypt"),
  "crypto-decrypt": useCipher("decrypt"),
  "crypto-key-pair": makeKeyPair,
  "crypto-sign": signData,
  "crypto-verify": verifyData,
  "crypto-agree": agreeOnKey,
  "crypto-wrap": useWrapper("wrap"),
  "crypto-unwrap": useWrapper("unwrap"),
  "crypto-export": exportKey,
  "crypto-import": importKey,
};

/**
 * The parameters of the crypto words, as REBOL text.
 */
export const CRYPTO_SPECS = {
  "crypto-digest": ["native", "data [any-string! binary!] method [word!]"],
  "crypto-random": ["native", "size [integer!]"],
  "crypto-uuid": ["native", ""],
  "crypto-hmac": ["native", "data [any-string! binary!] key [binary!] /hash name [word!]"],
  "crypto-derive": ["native", "passphrase [any-string! binary!] salt [any-string! binary!] rounds [integer!] /hash name [word!] /size bits [integer!]"],
  "crypto-expand": ["native", "key [binary!] salt [any-string! binary!] info [any-string! binary!] /hash name [word!] /size bits [integer!]"],
  "crypto-encrypt": ["native", "data [any-string! binary!] key [binary! string!] /method name [word!] /extra more [any-string! binary!]"],
  "crypto-decrypt": ["native", "data [binary!] key [binary! string!] /method name [word!] /extra more [any-string! binary!]"],
  "crypto-key-pair": ["native", "/method spec [word! block!]"],
  "crypto-sign": ["native", "data [any-string! binary!] key [string! binary!] /hash name [word!]"],
  "crypto-verify": ["native", "data [any-string! binary!] signature [binary!] key [string! binary!] /hash name [word!]"],
  "crypto-agree": ["native", "private-key [string!] public-key [string!] /size bits [integer!]"],
  "crypto-wrap": ["native", "key [binary!] wrapping-key [binary!]"],
  "crypto-unwrap": ["native", "data [binary!] wrapping-key [binary!]"],
  "crypto-export": ["native", "key [string!] format [word!]"],
  "crypto-import": ["native", "data [binary!] format [word!] method [word! block!]"],
};
