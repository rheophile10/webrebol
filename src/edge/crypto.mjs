// The work of the crypto words. Web Crypto does all the calculations. This module only makes its parameters.

const HASH_BYTES = { "SHA-1": 20, "SHA-256": 32, "SHA-384": 48, "SHA-512": 64 };
const HASH_NAMES = { sha1: "SHA-1", sha256: "SHA-256", sha384: "SHA-384", sha512: "SHA-512" };
const PAIR_NAMES = { ecdsa: "ECDSA", ecdh: "ECDH", ed25519: "Ed25519", x25519: "X25519", "rsa-pss": "RSA-PSS", "rsa-oaep": "RSA-OAEP", rsassa: "RSASSA-PKCS1-v1_5" };
const RSA_NAMES = { "RS": "RSASSA-PKCS1-v1_5", "PS": "RSA-PSS" };
const SHARED_BITS = { "P-256": 256, "P-384": 384, "P-521": 528, X25519: 256 };
const EXPONENT = [1, 0, 1];
const RSA_BITS = 2048;

// The first purpose is for a public key, and the second purpose is for a private key.
const PURPOSES = { "RSA-OAEP": ["encrypt", "decrypt"], ECDH: ["other", "agree"], X25519: ["other", "agree"] };
const SIGN_PURPOSES = ["verify", "sign"];
const USAGES = { sign: ["sign"], verify: ["verify"], encrypt: ["encrypt"], decrypt: ["decrypt"], agree: ["deriveBits"], other: [] };

/**
 * @usedby 18 declarations in crypto
 */
const subtle = () => globalThis.crypto.subtle;

// Web Crypto gives an ArrayBuffer. Only a typed array can read it, and STE-JS does not approve `new` for that type.
/**
 * @usedby 10 declarations in crypto
 */
const readBuffer = (buffer) => [...Reflect.construct(Uint8Array, [buffer])];

/**
 * @usedby encryptBytes, CRYPTO_WORK
 */
const makeRandom = (size) => globalThis.crypto.getRandomValues(Reflect.construct(Uint8Array, [size]));

/**
 * @uses PAIR_NAMES, HASH_NAMES, RSA_BITS, EXPONENT
 * @usedby makeKeyPair, importBytes
 */
const makeAlgorithm = (spec) => {
  // A specification is a list of texts: the name, and then a curve, a number of bits, or a hash in any sequence.
  const name = PAIR_NAMES[spec[0]];
  const hash = HASH_NAMES[spec.map((text) => text.replace("-", "")).find((text) => HASH_NAMES[text] !== undefined)] ?? "SHA-256";
  const curve = (spec.find((text) => /^p-\d+$/.test(text)) ?? "p-256").toUpperCase();
  const size = Number(spec.find((text) => /^\d+$/.test(text)) ?? RSA_BITS);
  if (name.startsWith("RSA")) return { name, modulusLength: size, publicExponent: Uint8Array.from(EXPONENT), hash };
  return name.startsWith("EC") ? { name, namedCurve: curve } : { name };
};

/**
 * @uses RSA_NAMES
 * @usedby importJwk
 */
const readKeyAlgorithm = (jwk, agrees) => {
  // A key in the JWK form tells its algorithm. Only a key of an elliptic curve can sign and can also agree.
  if (jwk.kty === "EC") return { name: agrees ? "ECDH" : "ECDSA", namedCurve: jwk.crv };
  if (jwk.kty === "OKP") return { name: jwk.crv };
  const method = jwk.alg ?? "RS256";
  if (method.startsWith("RSA-OAEP")) return { name: "RSA-OAEP", hash: `SHA-${method.split("-")[2] ?? "1"}` };
  return { name: RSA_NAMES[method.slice(0, 2)], hash: `SHA-${method.slice(2)}` };
};

/**
 * @uses readKeyAlgorithm, PURPOSES, SIGN_PURPOSES, subtle, USAGES
 * @usedby signData, verifyData, encryptBytes, decryptBytes, agreeOnBytes, exportBytes
 */
const importJwk = (text, purpose) => {
  // The list of permitted operations of the key is not used. The word of the script selects the operation.
  const jwk = Object.fromEntries(Object.entries(JSON.parse(text)).filter(([name]) => name !== "key_ops" && name !== "use"));
  const algorithm = readKeyAlgorithm(jwk, purpose === "agree" || purpose === "other");
  const found = purpose ?? (PURPOSES[algorithm.name] ?? SIGN_PURPOSES)[jwk.d === undefined ? 0 : 1];
  return subtle().importKey("jwk", jwk, algorithm, true, USAGES[found]);
};

/**
 * @uses subtle
 * @usedby makeKeyPair, importBytes
 */
const exportJwk = async (key) => JSON.stringify(await subtle().exportKey("jwk", key));

/**
 * @uses makeAlgorithm, PURPOSES, SIGN_PURPOSES, USAGES, subtle, exportJwk
 * @usedby CRYPTO_WORK
 */
const makeKeyPair = async (request) => {
  // The two keys are JSON texts in the JWK form: the public key and then the private key.
  const algorithm = makeAlgorithm(request.spec);
  const usages = (PURPOSES[algorithm.name] ?? SIGN_PURPOSES).flatMap((purpose) => USAGES[purpose]);
  const pair = await subtle().generateKey(algorithm, true, usages);
  return [await exportJwk(pair.publicKey), await exportJwk(pair.privateKey)];
};

/**
 * @uses subtle
 * @usedby signData, verifyData
 */
const importHmac = (request, usage) => subtle().importKey("raw", Uint8Array.from(request.key), { name: "HMAC", hash: request.method }, true, [usage]);

/**
 * @uses HASH_BYTES
 * @usedby signData, verifyData
 */
const makeSignFacts = (key, method) => ({ name: key.algorithm.name, hash: method, saltLength: HASH_BYTES[key.algorithm.hash?.name ?? method] });

/**
 * @uses importJwk, importHmac, readBuffer, subtle, makeSignFacts
 * @usedby CRYPTO_WORK
 */
const signData = async (request) => {
  // A key of bytes gives an HMAC. A key in the JWK form gives the signature of its algorithm.
  const key = await (typeof request.key === "string" ? importJwk(request.key, "sign") : importHmac(request, "sign"));
  return readBuffer(await subtle().sign(makeSignFacts(key, request.method), key, Uint8Array.from(request.data)));
};

/**
 * @uses importJwk, importHmac, subtle, makeSignFacts
 * @usedby CRYPTO_WORK
 */
const verifyData = async (request) => {
  const key = await (typeof request.key === "string" ? importJwk(request.key, "verify") : importHmac(request, "verify"));
  return subtle().verify(makeSignFacts(key, request.method), key, Uint8Array.from(request.signature), Uint8Array.from(request.data));
};

// Each cipher has the size of its start value, and the function that makes its parameters.
const CIPHERS = {
  "AES-GCM": { size: 12, make: (start, extra) => ({ name: "AES-GCM", "iv": start, ...(extra === null ? {} : { additionalData: Uint8Array.from(extra) }) }) },
  "AES-CBC": { size: 16, make: (start) => ({ name: "AES-CBC", "iv": start }) },
  "AES-CTR": { size: 16, make: (start) => ({ name: "AES-CTR", counter: start, length: 64 }) },
};

/**
 * @uses subtle
 * @usedby encryptBytes, decryptBytes
 */
const importAes = (request) => subtle().importKey("raw", Uint8Array.from(request.key), request.method, false, ["encrypt", "decrypt"]);

/**
 * @usedby encryptBytes, decryptBytes
 */
const makeLabel = (extra) => ({ name: "RSA-OAEP", ...(extra === null ? {} : { label: Uint8Array.from(extra) }) });

/**
 * @uses readBuffer, subtle, makeLabel, importJwk, CIPHERS, makeRandom, importAes
 * @usedby CRYPTO_WORK
 */
const encryptBytes = async (request) => {
  // A key in the JWK form is an RSA key. A key of bytes is an AES key.
  if (typeof request.key === "string") return readBuffer(await subtle().encrypt(makeLabel(request.extra), await importJwk(request.key, "encrypt"), Uint8Array.from(request.data)));
  // AES gets a new random start value. The result is the start value and then the encrypted bytes.
  const cipher = CIPHERS[request.method];
  const start = makeRandom(cipher.size);
  const sealed = await subtle().encrypt(cipher.make(start, request.extra), await importAes(request), Uint8Array.from(request.data));
  return [...start, ...readBuffer(sealed)];
};

/**
 * @uses readBuffer, subtle, makeLabel, importJwk, CIPHERS, importAes
 * @usedby CRYPTO_WORK
 */
const decryptBytes = async (request) => {
  if (typeof request.key === "string") return readBuffer(await subtle().decrypt(makeLabel(request.extra), await importJwk(request.key, "decrypt"), Uint8Array.from(request.data)));
  const cipher = CIPHERS[request.method];
  const start = Uint8Array.from(request.data.slice(0, cipher.size));
  return readBuffer(await subtle().decrypt(cipher.make(start, request.extra), await importAes(request), Uint8Array.from(request.data.slice(cipher.size))));
};

/**
 * @uses subtle, readBuffer
 * @usedby CRYPTO_WORK
 */
const deriveBytes = async (request) => {
  // PBKDF2 makes a key from a passphrase. It is slow by design.
  const base = await subtle().importKey("raw", Uint8Array.from(request.data), "PBKDF2", false, ["deriveBits"]);
  const facts = { name: "PBKDF2", salt: Uint8Array.from(request.salt), iterations: request.rounds, hash: request.method };
  return readBuffer(await subtle().deriveBits(facts, base, request.size));
};

/**
 * @uses subtle, readBuffer
 * @usedby CRYPTO_WORK
 */
const expandBytes = async (request) => {
  // HKDF makes a key from a different key. It is fast, thus it is not for a passphrase.
  const base = await subtle().importKey("raw", Uint8Array.from(request.data), "HKDF", false, ["deriveBits"]);
  const facts = { name: "HKDF", salt: Uint8Array.from(request.salt), info: Uint8Array.from(request.info), hash: request.method };
  return readBuffer(await subtle().deriveBits(facts, base, request.size));
};

/**
 * @uses importJwk, SHARED_BITS, readBuffer, subtle
 * @usedby CRYPTO_WORK
 */
const agreeOnBytes = async (request) => {
  // The private key of one person and the public key of the other person give the same secret bytes to the two persons.
  const [secret, other] = [await importJwk(request.key, "agree"), await importJwk(request.other, "other")];
  const bits = request.size ?? SHARED_BITS[secret.algorithm.namedCurve ?? secret.algorithm.name];
  return readBuffer(await subtle().deriveBits({ name: secret.algorithm.name, public: other }, secret, bits));
};

const HMAC_KEY = { name: "HMAC", hash: "SHA-256" };

/**
 * @uses subtle
 * @usedby wrapBytes, unwrapBytes
 */
const importWrapper = (request) => subtle().importKey("raw", Uint8Array.from(request.key), "AES-KW", false, ["wrapKey", "unwrapKey"]);

/**
 * @uses subtle, HMAC_KEY, readBuffer, importWrapper
 * @usedby CRYPTO_WORK
 */
const wrapBytes = async (request) => {
  // AES-KW encrypts the bytes of a key. Web Crypto wraps only a key object, thus the bytes become a key object first.
  const inner = await subtle().importKey("raw", Uint8Array.from(request.data), HMAC_KEY, true, ["sign"]);
  return readBuffer(await subtle().wrapKey("raw", inner, await importWrapper(request), "AES-KW"));
};

/**
 * @uses subtle, importWrapper, HMAC_KEY, readBuffer
 * @usedby CRYPTO_WORK
 */
const unwrapBytes = async (request) => {
  const inner = await subtle().unwrapKey("raw", Uint8Array.from(request.data), await importWrapper(request), "AES-KW", HMAC_KEY, true, ["sign"]);
  return readBuffer(await subtle().exportKey("raw", inner));
};

/**
 * @uses readBuffer, subtle, importJwk
 * @usedby CRYPTO_WORK
 */
const exportBytes = async (request) => readBuffer(await subtle().exportKey(request.format, await importJwk(request.key)));

/**
 * @uses makeAlgorithm, PURPOSES, SIGN_PURPOSES, exportJwk, subtle, USAGES
 * @usedby CRYPTO_WORK
 */
const importBytes = async (request) => {
  // The format pkcs8 holds a private key. The other formats hold a public key.
  const algorithm = makeAlgorithm(request.spec);
  const purpose = (PURPOSES[algorithm.name] ?? SIGN_PURPOSES)[request.format === "pkcs8" ? 1 : 0];
  return exportJwk(await subtle().importKey(request.format, Uint8Array.from(request.data), algorithm, true, USAGES[purpose]));
};

/**
 * @uses readBuffer, subtle, makeRandom, deriveBytes, expandBytes, encryptBytes, decryptBytes, makeKeyPair, signData,
 *   verifyData, agreeOnBytes, wrapBytes, unwrapBytes, exportBytes, importBytes
 * @usedby performCrypto
 */
const CRYPTO_WORK = {
  digest: async (request) => readBuffer(await subtle().digest(request.method, Uint8Array.from(request.data))),
  random: async (request) => [...makeRandom(request.size)],
  uuid: async () => globalThis.crypto.randomUUID(),
  derive: deriveBytes,
  expand: expandBytes,
  encrypt: encryptBytes,
  decrypt: decryptBytes,
  keypair: makeKeyPair,
  sign: signData,
  verify: verifyData,
  agree: agreeOnBytes,
  wrap: wrapBytes,
  unwrap: unwrapBytes,
  export: exportBytes,
  import: importBytes,
};

/**
 * Does the work of one crypto request with Web Crypto.
 * @param {{ work: string }} request - The name of the work and its data.
 * @returns {Promise<number[] | string | string[] | boolean | null>}
 * @standard refusal - Work that Web Crypto refuses gives null: a wrong key, changed bytes, or an algorithm that the engine does not have.
 * @uses CRYPTO_WORK
 * @usedby HANDLERS
 */
export const performCrypto = async (request) => {
  try {
    return await CRYPTO_WORK[request.work](request);
  } catch {
    return null;
  }
};
