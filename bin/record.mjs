// Start: node bin/record.mjs
// This program runs each case file through REBOL Core 2.7.8 and writes the results to test/golden/.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { MUSIC_CORE } from "../src/music/boot.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
/**
 * @uses ROOT
 * @usedby runRebol, runCase
 */
const REBOL = `${ROOT}reference/rebol-core.sh`;
const LIMITS = { encoding: "latin1", timeout: 20000, maxBuffer: 16 * 1024 * 1024 };
const RESULT = /^([\s\S]*)\n@@RESULT ([0-9A-F]*)\n$/;

/**
 * @usedby recordCase, recordView
 */
const readHex = (hex) => Buffer.from(hex, "hex").toString("latin1");

/**
 * @usedby runCase, recordCase, recordView
 */
const writeHex = (text) => Buffer.from(text, "latin1").toString("hex").toUpperCase();

/**
 * @uses REBOL, ROOT, LIMITS
 * @usedby recordLoad, recordSpecs, recordErrors, recordViewSpecs
 */
const runRebol = (script, argument) => execFileSync(REBOL, ["-qs", `${ROOT}reference/${script}`, argument], LIMITS);

// The loader cases run in one session, because a load does not change the session.
/**
 * @uses runRebol
 * @usedby pickRecorder
 */
const recordLoad = (path) => runRebol("load.r", path);

/**
 * @uses LIMITS
 * @usedby runCase
 */
const LIMITS_FOR_CASE = { ...LIMITS, timeout: 5000 };

/**
 * @uses REBOL, ROOT, writeHex, LIMITS_FOR_CASE
 * @usedby recordCase
 */
const runCase = (source, folder) => {
  // A case that does not end in REBOL cannot be a test. Tell the person which case it is.
  try {
    return execFileSync(REBOL, ["-qs", `${ROOT}reference/do.r`, writeHex(source)], { ...LIMITS_FOR_CASE, cwd: folder });
  } catch (fault) {
    throw new Error(`This case did not end in REBOL, or REBOL stopped: ${source} (${fault.code})`);
  }
};

/**
 * @uses runCase, RESULT, readHex, writeHex
 * @usedby recordCases
 */
const recordCase = (prelude) => (source) => {
  // Each evaluation case runs in a new REBOL session. Thus a word of one case cannot change a different case.
  // The case runs in a new empty folder. In the results, the path of this folder becomes the root of the disk.
  // REBOL evaluates the prelude before the case. The recorded source is only the case.
  const folder = mkdtempSync(`${tmpdir()}/webrebol-`);
  const match = runCase(prelude + source, folder).match(RESULT);
  rmSync(folder, { recursive: true });
  if (match === null) throw new Error(`REBOL gave no result for this case: ${source}`);
  const [output, result] = [match[1], readHex(match[2])].map((text) => text.split(folder).join(""));
  return `${writeHex(source)} ${writeHex(result)} ${writeHex(output)}\n`;
};

/**
 * @uses recordCase
 * @usedby recordDo, recordMusic
 */
const recordCases = (prelude) => (path) =>
  readFileSync(path, "latin1")
    .split("\n")
    .filter((line) => line !== "")
    .map(recordCase(prelude))
    .join("");

/**
 * @uses recordCases
 * @usedby pickRecorder
 */
const recordDo = recordCases("");

// REBOL has no music words. Thus each music case starts with the music mezzanines of WebRebol.
/**
 * @uses recordCases, MUSIC_CORE (src/music/boot.mjs)
 * @usedby pickRecorder
 */
const recordMusic = recordCases(MUSIC_CORE);

const GROUPS = ["load", "do", "defects", "music", "view"];

/**
 * @uses recordLoad, recordDo, recordMusic, recordView
 * @usedby recordFile
 */
const pickRecorder = (group) => ({ load: recordLoad, "do": recordDo, defects: recordDo, music: recordMusic, view: recordView })[group];

/**
 * @uses pickRecorder, ROOT
 * @usedby recordGroup
 */
const recordFile = (group, name) => {
  const lines = pickRecorder(group)(`${ROOT}test/cases/${group}/${name}`);
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
 * @usedby EXTRAS
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
 * @usedby EXTRAS
 */
const recordErrors = () => {
  const lines = runRebol("errors.r", "").trim().split("\n");
  writeFileSync(`${ROOT}src/natives/errorids.mjs`, `${ERRORS_HEAD}${lines.map(writeCategory).join("")}};\n`);
  return `errors: ${lines.length} categories`;
};

/**
 * @uses ROOT
 * @usedby recordViewData, recordViewSpecs
 */
const VIEW = `${ROOT}reference/rebol-view.sh`;
const VIEW_LIMITS = { encoding: "latin1", timeout: 300000, maxBuffer: 64 * 1024 * 1024 };
const VIEW_CASE = /@@BEGIN ([0-9A-F]*)\n([\s\S]*?)@@END/g;

/**
 * @usedby recordViewData, recordViewSpecs
 */
const writeLines = (name, lines) =>
  `// bin/record.mjs makes this file from REBOL View 2.7.8. Do not change it.\n\n/**\n * ${name}\n */\nexport const LINES = [\n${lines.map((line) => `  ${JSON.stringify(line)},\n`).join("")}];\n`;

/**
 * @uses VIEW, VIEW_LIMITS, ROOT, writeLines
 * @usedby EXTRAS
 */
const recordViewData = () => {
  // REBOL View runs in Docker. It writes the color words, the widths of the characters, and the facets of the styles.
  const lines = execFileSync(VIEW, ["-qs", "viewdata.r"], VIEW_LIMITS).trim().split("\n");
  writeFileSync(`${ROOT}src/view/viewdata.mjs`, writeLines("The colors, the font sizes and the VID styles of REBOL View 2.7.8, one fact on each line.", lines));
  return `view data: ${lines.length} lines`;
};

/**
 * @uses runRebol, VIEW, VIEW_LIMITS, ROOT, writeLines
 * @usedby EXTRAS
 */
const recordViewSpecs = () => {
  // Keep the functions that View has and Core does not have.
  const core = runRebol("specs.r", "").replace(/\n\]/g, "]").trim().split("\n").map((line) => line.split(" ")[0]);
  const all = execFileSync(VIEW, ["-qs", "specs.r"], VIEW_LIMITS).replace(/\n\]/g, "]").trim().split("\n");
  const added = all.filter((line) => !core.includes(line.split(" ")[0]));
  writeFileSync(`${ROOT}src/view/viewspecs.mjs`, writeLines("The name, the type and the parameters of each function that REBOL View 2.7.8 adds to Core.", added));
  return `view specs: ${added.length} functions`;
};

const DOCKER = ["run", "--rm", "--init", "--entrypoint", "/work/view-cases.sh"];

/**
 * @uses writeHex, ROOT, DOCKER, VIEW_LIMITS, readHex, VIEW_CASE
 * @usedby pickRecorder
 */
const recordView = (path) => {
  // All the cases of a file run in one container. Each case has a new REBOL View session.
  const sources = readFileSync(path, "latin1").split("\n").filter((line) => line !== "");
  const folder = mkdtempSync(`${tmpdir()}/webrebol-view-`);
  writeFileSync(`${folder}/cases.hex`, `${sources.map(writeHex).join("\n")}\n`);
  const mounts = ["-v", `${ROOT}reference/rebol-view-278-4-3/releases/rebol-view:/rebol:ro`, "-v", `${ROOT}reference:/work:ro`, "-v", `${folder}:/cases:ro`];
  const output = execFileSync("docker", [...DOCKER, ...mounts, "webrebol-rebview"], VIEW_LIMITS);
  rmSync(folder, { recursive: true });
  const readCase = (match) => {
    const result = match[2].match(/^([\s\S]*)\n@@RESULT ([0-9A-F]*)\n$/);
    if (result === null) throw new Error(`REBOL View gave no result for this case: ${readHex(match[1])}`);
    return `${match[1]} ${result[2]} ${writeHex(result[1])}\n`;
  };
  return [...output.matchAll(VIEW_CASE)].map(readCase).join("");
};

/**
 * @uses ROOT, recordFile
 * @usedby bin/record.mjs
 */
const recordGroup = (group) => readdirSync(`${ROOT}test/cases/${group}`).map((name) => recordFile(group, name));

/**
 * @uses recordSpecs, recordErrors, recordViewData, recordViewSpecs
 * @usedby bin/record.mjs
 */
const EXTRAS = [recordSpecs, recordErrors, recordViewData, recordViewSpecs];

console.log([...GROUPS.flatMap(recordGroup), ...EXTRAS.map((record) => record())].join("\n"));
