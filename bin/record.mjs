// Start: node bin/record.mjs
// This program runs each case file through REBOL Core 2.7.8 and writes the results to test/golden/.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
/**
 * @uses ROOT
 * @usedby runRebol
 */
const REBOL = `${ROOT}reference/rebol-core.sh`;
const LIMITS = { encoding: "latin1", timeout: 20000, maxBuffer: 16 * 1024 * 1024 };
const RESULT = /^([\s\S]*)\n@@RESULT ([0-9A-F]*)\n$/;

/**
 * @usedby recordCase
 */
const writeHex = (text) => Buffer.from(text, "latin1").toString("hex").toUpperCase();

/**
 * @uses REBOL, ROOT, LIMITS
 * @usedby recordLoad, recordCase, recordSpecs, recordErrors
 */
const runRebol = (script, argument) => execFileSync(REBOL, ["-qs", `${ROOT}reference/${script}`, argument], LIMITS);

// The loader cases run in one session, because a load does not change the session.
/**
 * @uses runRebol
 * @usedby RECORDERS
 */
const recordLoad = (path) => runRebol("load.r", path);

/**
 * @uses runRebol, writeHex, RESULT
 * @usedby recordDo
 */
const recordCase = (source) => {
  // Each evaluation case runs in a new REBOL session. Thus a word of one case cannot change a different case.
  const [, output, result] = runRebol("do.r", writeHex(source)).match(RESULT);
  return `${writeHex(source)} ${result} ${writeHex(output)}\n`;
};

/**
 * @uses recordCase
 * @usedby RECORDERS
 */
const recordDo = (path) =>
  readFileSync(path, "latin1")
    .split("\n")
    .filter((line) => line !== "")
    .map(recordCase)
    .join("");

/**
 * @uses recordLoad, recordDo
 * @usedby recordFile, bin/record.mjs
 */
const RECORDERS = { load: recordLoad, "do": recordDo };

/**
 * @uses RECORDERS, ROOT
 * @usedby recordGroup
 */
const recordFile = (group, name) => {
  const lines = RECORDERS[group](`${ROOT}test/cases/${group}/${name}`);
  writeFileSync(`${ROOT}test/golden/${group}/${name}`, lines, "latin1");
  return `${group}/${name}: ${lines.trim().split("\n").length} cases`;
};

/**
 * @usedby recordSpecs
 */
const writeSpec = (line) => {
  // A line has the name, the type and the parameters of one function.
  const [, name, type, spec] = line.match(/^(\S+) (\S+) ?(.*)$/);
  return `  ${JSON.stringify(name)}: [${JSON.stringify(type)}, ${JSON.stringify(spec)}],\n`;
};

const SPECS_HEAD = `// bin/record.mjs makes this file from REBOL Core 2.7.8. Do not change it.

/**
 * The type and the parameters of each function of REBOL 2.7.8 Core, without the help texts.
 */
export const SPECS = {
`;

/**
 * @uses runRebol, ROOT, SPECS_HEAD, writeSpec
 * @usedby bin/record.mjs
 */
const recordSpecs = () => {
  // REBOL writes a line end before the last bracket of one long list of types. Join such a line to its start.
  const lines = runRebol("specs.r", "").replace(/\n\]/g, "]").trim().split("\n");
  writeFileSync(`${ROOT}src/natives/specs.mjs`, `${SPECS_HEAD}${lines.map(writeSpec).join("")}};\n`);
  return `specs: ${lines.length} functions`;
};

/**
 * @usedby recordErrors
 */
const writeCategory = (line) => {
  // A line has the name of the category, its first code, and its ids in the sequence of their codes.
  const [name, code, ...ids] = line.split(" ");
  return `  ${JSON.stringify(name)}: { code: ${code}, ids: ${JSON.stringify(ids)} },\n`;
};

const ERRORS_HEAD = `// bin/record.mjs makes this file from REBOL Core 2.7.8. Do not change it.

/**
 * The first code and the ids of each category of REBOL errors, without the message texts.
 */
export const ERROR_IDS = {
`;

/**
 * @uses runRebol, ROOT, ERRORS_HEAD, writeCategory
 * @usedby bin/record.mjs
 */
const recordErrors = () => {
  const lines = runRebol("errors.r", "").trim().split("\n");
  writeFileSync(`${ROOT}src/natives/errorids.mjs`, `${ERRORS_HEAD}${lines.map(writeCategory).join("")}};\n`);
  return `errors: ${lines.length} categories`;
};

/**
 * @uses ROOT, recordFile
 * @usedby bin/record.mjs
 */
const recordGroup = (group) => readdirSync(`${ROOT}test/cases/${group}`).map((name) => recordFile(group, name));

console.log([...Object.keys(RECORDERS).flatMap(recordGroup), recordSpecs(), recordErrors()].join("\n"));
