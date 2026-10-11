// Start: node bin/record.mjs
// This program runs each case file through REBOL Core 2.7.8 and writes the results to test/golden/.
import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
/**
 * @uses ROOT
 * @usedby recordCases
 */
const REBOL = `${ROOT}reference/rebol-core.sh`;
const CASE = /\n@@CASE ([0-9A-F]*)\n([\s\S]*?)\n@@RESULT ([0-9A-F]*)\n/g;

/**
 * @usedby joinCases
 */
const writeHex = (text) => Buffer.from(text, "latin1").toString("hex").toUpperCase();

// The output of do.r has marks around the printed text of each case. Make one line for each case.
/**
 * @uses CASE, writeHex
 * @usedby FORMATS
 */
const joinCases = (output) =>
  [...output.matchAll(CASE)].map((match) => `${match[1]} ${match[3]} ${writeHex(match[2])}\n`).join("");

/**
 * @uses joinCases
 * @usedby recordCases, bin/record.mjs
 */
const FORMATS = { load: (output) => output, "do": joinCases };

/**
 * @uses ROOT, REBOL, FORMATS
 * @usedby recordGroup
 */
const recordCases = (group, name) => {
  // REBOL reads the case file and writes the result of each case.
  const script = `${ROOT}reference/${group}.r`;
  const output = execFileSync(REBOL, ["-qs", script, `${ROOT}test/cases/${group}/${name}`], { encoding: "latin1" });
  const lines = FORMATS[group](output);
  writeFileSync(`${ROOT}test/golden/${group}/${name}`, lines, "latin1");
  return `${group}/${name}: ${lines.trim().split("\n").length} cases`;
};

/**
 * @uses ROOT, recordCases
 * @usedby bin/record.mjs
 */
const recordGroup = (group) => readdirSync(`${ROOT}test/cases/${group}`).map((name) => recordCases(group, name));

console.log(Object.keys(FORMATS).flatMap(recordGroup).join("\n"));
