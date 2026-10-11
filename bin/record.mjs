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
/**
 * @uses ROOT
 * @usedby recordCases
 */
const SCRIPT = `${ROOT}reference/golden.r`;

/**
 * @uses REBOL, SCRIPT, ROOT
 * @usedby bin/record.mjs
 */
const recordCases = (name) => {
  // REBOL reads the case file and writes one line for each case.
  const output = execFileSync(REBOL, ["-qs", SCRIPT, `${ROOT}test/cases/${name}`], { encoding: "latin1" });
  writeFileSync(`${ROOT}test/golden/${name}`, output, "latin1");
  return `${name}: ${output.trim().split("\n").length} cases`;
};

console.log(readdirSync(`${ROOT}test/cases`).map(recordCases).join("\n"));
