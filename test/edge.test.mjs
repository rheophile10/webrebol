import { test } from "node:test";
import assert from "node:assert/strict";
import { askEdge, answerRequest } from "../src/machine/machine.mjs";
import { runMachine } from "../src/machine/run.mjs";
import { showResult, startSource } from "../src/session/interpret.mjs";
import { countCrc, hashMd5 } from "../src/natives/digest.mjs";
import { driveMachine, interpretWithEdge, performRequest } from "../src/edge/drive.mjs";
import { performCrypto } from "../src/edge/crypto.mjs";
import { readGolden } from "./golden.edge.mjs";

const BATCHES = 100;

/**
 * @uses interpretWithEdge (src/edge/drive.mjs), BATCHES, showResult (src/session/interpret.mjs)
 * @usedby findProblems
 */
const showRun = async (source) => {
  // Show the result and the printed text in the same form as the recorded case.
  const machine = await interpretWithEdge(source, BATCHES);
  return `${showResult(machine)} | ${machine.store.output}`;
};

/**
 * @uses readGolden, showRun
 */
const findProblems = async (name) => {
  const entries = readGolden(name);
  const shown = await Promise.all(entries.map((entry) => showRun(entry.source)));
  return entries
    .map((entry, place) => `${entry.source} gives ${shown[place]}, not ${entry.expected} | ${entry.output}`)
    .filter((text, place) => shown[place] !== `${entries[place].expected} | ${entries[place].output}`);
};

test("interpretWithEdge reference: the checksum and clock cases agree with REBOL 2.7.8", async () => {
  assert.deepEqual(await findProblems("do/edge.txt"), []);
});

test("driveMachine answer: a machine that waits for a digest continues with the bytes", async () => {
  const machine = await driveMachine(startSource('checksum/secure "abc"'), BATCHES);
  assert.equal(showResult(machine), "#{A9993E364706816ABA3E25717850C26C9CD0D89D}");
});

test("askEdge wait: the machine gets the mode wait", () => {
  assert.equal(askEdge(startSource("1"), { kind: "clock" }).mode, "wait");
});

test("answerRequest resume: the function of the request gets the answer", () => {
  const waiting = askEdge(startSource("1"), { kind: "clock", resume: (machine, answer) => ({ ...machine, got: answer }) });
  assert.equal(answerRequest(waiting, 42).got, 42);
});

test("runMachine wait: a machine that waits for the clock stops", () => {
  assert.equal(runMachine(startSource("now"), BATCHES).mode, "wait");
});

test("startSource syntax: a block without its end gives a machine that throws", () => {
  assert.equal(startSource("[1").thrown.value.value, "syntax missing");
});

test("countCrc reference: the bytes of abc give 1664899", () => {
  assert.equal(countCrc([97, 98, 99]), 1664899);
});

test("hashMd5 reference: the bytes of abc give the standard digest", () => {
  const hex = hashMd5([97, 98, 99]).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  assert.equal(hex, "900150983cd24fb0d6963f7d28e17f72");
});

test("performRequest kinds: the clock request gives the time and the offset of the zone", async () => {
  const answer = await performRequest({ kind: "clock" });
  assert.equal(typeof answer.milliseconds, "number");
  assert.equal(typeof answer.offset, "number");
});

/**
 * @uses showResult (src/session/interpret.mjs), interpretWithEdge (src/edge/drive.mjs), BATCHES
 */
const runWithEdge = async (source) => showResult(await interpretWithEdge(source, BATCHES));

test("interpretWithEdge reference: the SHA-256 digest of abc is the standard digest", async () => {
  assert.match(await runWithEdge("crypto-digest \"abc\" 'sha256"), /BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD/);
});

test("interpretWithEdge reference: encrypted bytes give the first text again with the key, and none with a different key", async () => {
  const source = 'key: crypto-derive "secret" "salt" 1000 sealed: crypto-encrypt "hello" key reduce [to-string crypto-decrypt sealed key crypto-decrypt sealed crypto-random 32]';
  assert.equal(await runWithEdge(source), '["hello" none]');
});

test("interpretWithEdge reference: a signature agrees with its message and not with a different message", async () => {
  const source = 'keys: crypto-key-pair mark: crypto-sign "message" second keys reduce [crypto-verify "message" mark first keys crypto-verify "other" mark first keys]';
  assert.equal(await runWithEdge(source), "[true false]");
});

test("interpretWithEdge reference: the HMAC with SHA-256 of the RFC 4231 test is the standard value", async () => {
  const source = 'crypto-hmac "what do ya want for nothing?" to-binary "Jefe"';
  assert.match(await runWithEdge(source), /5BDCC146BF60754E6A042426089575C75A003F089D2739839DEC58B964EC3843/);
});

test("interpretWithEdge reference: PBKDF2 with one round gives the standard key", async () => {
  assert.match(await runWithEdge('crypto-derive "password" "salt" 1'), /120FB6CFFCF8B32C43E7225256C4F837A86548C92CCC35480805987CB70BE17B/);
});

test("interpretWithEdge reference: HKDF gives the key of the first test of RFC 5869", async () => {
  const source = "crypto-expand/size #{0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B} #{000102030405060708090A0B0C} #{F0F1F2F3F4F5F6F7F8F9} 336";
  assert.match((await runWithEdge(source)).replace(/\s/g, ""), /3CB25F25FAACD57A90434F64D0362F2A2D2D0A90CF1A5A4C5DB02D56ECC4C5BF34007208D5B887185865/);
});

test("interpretWithEdge reference: AES-KW gives the wrapped key of RFC 3394, and the first key again", async () => {
  const source = "kek: #{000102030405060708090A0B0C0D0E0F} key: #{00112233445566778899AABBCCDDEEFF} wrapped: crypto-wrap key kek reduce [wrapped equal? key crypto-unwrap wrapped kek]";
  assert.equal(await runWithEdge(source), "[#{1FA68B0A8112B447AEF34BD8FB5A7B829D3E862371D2CFE5} true]");
});

test("interpretWithEdge reference: each AES mode gives the first text again", async () => {
  const source = 'key: crypto-random 32 collect [foreach mode [aes-gcm aes-cbc aes-ctr] [keep to-string crypto-decrypt/method crypto-encrypt/method "secret" key mode key mode]]';
  assert.equal(await runWithEdge(source), '["secret" "secret" "secret"]');
});

test("interpretWithEdge reference: additional data that changed gives none", async () => {
  const source = 'key: crypto-random 32 sealed: crypto-encrypt/extra "text" key "head" reduce [to-string crypto-decrypt/extra sealed key "head" crypto-decrypt/extra sealed key "tail"]';
  assert.equal(await runWithEdge(source), '["text" none]');
});

test("interpretWithEdge reference: each signature algorithm agrees with its message and not with a different message", async () => {
  const source = 'collect [foreach spec [[ecdsa p-384] ed25519 rsa-pss [rsassa 2048 sha384]] [pair: crypto-key-pair/method spec mark: crypto-sign "message" second pair keep crypto-verify "message" mark first pair keep crypto-verify "other" mark first pair]]';
  assert.equal(await runWithEdge(source), "[true false true false true false true false]");
});

test("interpretWithEdge reference: RSA-OAEP decrypts with the private key and not with the public key", async () => {
  const source = 'pair: crypto-key-pair/method \'rsa-oaep sealed: crypto-encrypt "for you" first pair reduce [to-string crypto-decrypt sealed second pair crypto-decrypt sealed first pair]';
  assert.equal(await runWithEdge(source), '["for you" none]');
});

test("interpretWithEdge reference: two persons get the same secret bytes from ECDH and from X25519", async () => {
  const source = "collect [foreach spec [ecdh x25519] [mine: crypto-key-pair/method spec yours: crypto-key-pair/method spec keep equal? crypto-agree second mine first yours crypto-agree second yours first mine]]";
  assert.equal(await runWithEdge(source), "[true true]");
});

test("interpretWithEdge reference: a key that goes out as spki and pkcs8 and comes in again does the same work", async () => {
  const source = "pair: crypto-key-pair mark: crypto-sign \"text\" crypto-import crypto-export second pair 'pkcs8 'pkcs8 'ecdsa crypto-verify \"text\" mark crypto-import crypto-export first pair 'spki 'spki 'ecdsa";
  assert.equal(await runWithEdge(source), "true");
});

test("interpretWithEdge reference: an algorithm name that is not known gives an error", async () => {
  assert.match(await runWithEdge("crypto-key-pair/method 'dsa"), /script invalid-arg/);
});

test("performCrypto refusal: bytes that are not a wrapped key give null", async () => {
  assert.equal(await performCrypto({ work: "unwrap", data: [1, 2, 3], key: Array.from({ length: 16 }, () => 7) }), null);
});

test("performRequest kinds: the wait request gives null after its time", async () => {
  assert.equal(await performRequest({ kind: "wait", milliseconds: 1 }), null);
  assert.equal(await runWithEdge("wait 0.01"), "none");
});
