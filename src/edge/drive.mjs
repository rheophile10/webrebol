/** @import { Machine } from "../types/states.mjs" */
import { answerRequest } from "../machine/machine.mjs";
import { runMachine } from "../machine/run.mjs";
import { startSource } from "../session/interpret.mjs";
import { EMPTY_DISK } from "../store/disk.mjs";

const SHA_1 = "SHA-1";
/**
 * @uses SHA_1
 * @usedby digestBytes
 */
const HMAC = { name: "HMAC", hash: SHA_1 };

// Web Crypto gives an ArrayBuffer. Only a typed array can read it, and STE-JS does not approve `new` for that type.
/**
 * @usedby digestBytes
 */
const readBuffer = (buffer) => [...Reflect.construct(Uint8Array, [buffer])];

/**
 * @uses readBuffer, SHA_1, HMAC
 * @usedby HANDLERS
 */
const digestBytes = async (request) => {
  // Web Crypto calculates the SHA-1 digest. With a key, it calculates the HMAC.
  const bytes = Uint8Array.from(request.bytes);
  if (request.key === null) return readBuffer(await globalThis.crypto.subtle.digest(SHA_1, bytes));
  const key = await globalThis.crypto.subtle.importKey("raw", Uint8Array.from(request.key), HMAC, false, ["sign"]);
  return readBuffer(await globalThis.crypto.subtle.sign("HMAC", key, bytes));
};

/**
 * @usedby HANDLERS
 */
const readClock = async () => {
  // The text of the date has the offset of the local time zone, for example "GMT-0400".
  const [, sign, hours, minutes] = Date().match(/GMT([+-])(\d{2})(\d{2})/) ?? [null, "+", "0", "0"];
  return { milliseconds: Date.now(), offset: (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes)) };
};

/**
 * @uses digestBytes, readClock
 * @usedby performRequest, driveMachine
 */
const HANDLERS = { digest: digestBytes, clock: readClock };

/**
 * Does the work of one request of a machine that waits.
 * @param {{ kind: string }} request
 * @returns {Promise<*>}
 * @standard kinds - The kinds are "digest" and "clock".
 * @uses HANDLERS
 * @usedby driveMachine, serveRequest
 */
export const performRequest = (request) => HANDLERS[request.kind](request);

/**
 * Runs a machine to its end. When the machine waits, the edge does the work and the machine continues.
 * @param {Machine} machine
 * @param {number} batches - The budget between two requests, in groups of 1000 steps.
 * @returns {Promise<Machine>}
 * @standard answer - A machine that waits for a digest continues with the bytes of the digest.
 * @uses runMachine (src/machine/run.mjs), HANDLERS, performRequest, answerRequest (src/machine/machine.mjs)
 * @usedby interpretWithEdge
 */
export const driveMachine = async (machine, batches) => {
  const stopped = runMachine(machine, batches);
  if (stopped.mode !== "wait") return stopped;
  if (HANDLERS[stopped.request.kind] === undefined) return stopped;
  const answer = await performRequest(stopped.request);
  return driveMachine(answerRequest(stopped, answer), batches);
};

/**
 * Evaluates a REBOL source text in a new session, with the edge for the clock and for Web Crypto.
 * @param {string} source - The REBOL source text.
 * @param {number} batches - The budget between two requests, in groups of 1000 steps.
 * @param {Object<string, object>} [disk] - The disk at the start of the session. Without it, the disk is empty.
 * @returns {Promise<Machine>}
 * @standard reference - The result is the result that `do` of REBOL 2.7.8 gives.
 * @uses EMPTY_DISK (src/store/disk.mjs), driveMachine, startSource (src/session/interpret.mjs)
 * @usedby bin/webrebol.mjs, showRun (test/edge.test.mjs)
 */
export const interpretWithEdge = (source, batches, disk = EMPTY_DISK) => {
  // The session starts with the time of the clock. A file that the session writes gets this time.
  const started = Date.now();
  return driveMachine(startSource(source, { disk, started, seed: started | 0 }), batches);
};
