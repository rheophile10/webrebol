// Start: node bin/compare.mjs
// This program loads each script of corpus/scripts/ in REBOL View 2.7.8 (in Docker, without a network) and in WebRebol.
// It compares the type and the text of each loaded value, and it shows how many scripts agree.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadSource } from "../src/data/load.mjs";
import { EMPTY_STORE, allocate, isList, readRest } from "../src/store/store.mjs";
import { moldValue } from "../src/store/mold.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
/**
 * @uses ROOT
 * @usedby MOUNTS, loadScript, names
 */
const CORPUS = `${ROOT}corpus/scripts`;
const LIMITS = { encoding: "latin1", timeout: 900000, maxBuffer: 1024 * 1024 * 1024 };
const WORD_TYPES = ["word", "set-word", "get-word", "lit-word", "refinement"];
/**
 * @uses ROOT, CORPUS
 * @usedby DOCKER
 */
const MOUNTS = ["-v", `${ROOT}reference/rebol-view-278-4-3/releases/rebol-view:/rebol:ro`, "-v", `${ROOT}reference:/work:ro`, "-v", `${CORPUS}:/corpus:ro`];
/**
 * @uses MOUNTS
 * @usedby readReference
 */
const DOCKER = ["run", "--rm", "--init", "--network", "none", "--entrypoint", "/work/corpus-load.sh", ...MOUNTS, "webrebol-rebview"];

/**
 * @uses isList (src/store/store.mjs), readRest (src/store/store.mjs), WORD_TYPES, moldValue (src/store/mold.mjs)
 * @usedby loadScript
 */
const walkValue = (store) => (value) => {
  // A block gives its type, its values, and a closing line. A word shows in small letters, as in the REBOL script.
  if (isList(value)) return [`${value.type} [`, ...readRest(store, value).flatMap(walkValue(store)), "]"];
  const text = WORD_TYPES.includes(value.type) ? String(value.value).toLowerCase() : moldValue(store, value);
  return [`${value.type} ${text}`];
};

/**
 * @uses loadSource (src/data/load.mjs), CORPUS, allocate (src/store/store.mjs), EMPTY_STORE (src/store/store.mjs),
 *   readRest (src/store/store.mjs), walkValue
 * @usedby compareScript
 */
const loadScript = (name) => {
  // The function read of REBOL changes each CR LF to a line feed. Do the same here.
  const loaded = loadSource(readFileSync(`${CORPUS}/${name}`, "latin1").replace(/\r\n/g, "\n"));
  if (loaded.type === "error") return `LOAD-ERROR ${loaded.value}`;
  const made = allocate(EMPTY_STORE, loaded);
  return readRest(made.store, made.value).flatMap(walkValue(made.store)).join("\n");
};

/**
 * @uses DOCKER, LIMITS
 * @usedby results
 */
const readReference = () => {
  // REBOL writes "@@FILE name" before the values of each script.
  const output = execFileSync("docker", DOCKER, LIMITS);
  const parts = output.split("@@END")[0].split("@@FILE ").slice(1);
  return Object.fromEntries(parts.map((part) => [part.slice(0, part.indexOf("\n")), part.slice(part.indexOf("\n") + 1).replace(/\n$/, "")]));
};

/**
 * @usedby compareScript
 */
const findDifference = (expected, actual) => {
  // Give the first line that is different, for the report.
  const [first, second] = [expected.split("\n"), actual.split("\n")];
  const place = first.findIndex((line, index) => line !== second[index]);
  return place < 0 ? `REBOL has ${first.length} lines, WebRebol has ${second.length}` : `line ${place + 1}: REBOL "${first[place].slice(0, 70)}" WebRebol "${String(second[place]).slice(0, 70)}"`;
};

/**
 * @uses loadScript, findDifference
 * @usedby results
 */
const compareScript = (reference) => (name) => {
  const expected = reference[name];
  if (expected === undefined) return { name, state: "absent", note: "REBOL gave no result" };
  const actual = loadScript(name);
  return actual === expected ? { name, state: "same", note: "" } : { name, state: "different", note: findDifference(expected, actual) };
};

/**
 * @uses CORPUS
 * @usedby results, report
 */
const names = [...readdirSync(CORPUS).filter((name) => name.endsWith(".r"))].sort();
/**
 * @uses names, compareScript, readReference
 * @usedby count, report
 */
const results = names.map(compareScript(readReference()));
/**
 * @uses results
 * @usedby report
 */
const count = (state) => results.filter((result) => result.state === state).length;
/**
 * @uses names, count, results
 * @usedby bin/compare.mjs
 */
const report = [
  `Scripts: ${names.length}`,
  `Loaded values agree: ${count("same")}`,
  `Loaded values are different: ${count("different")}`,
  `No result from REBOL: ${count("absent")}`,
  "",
  ...results.filter((result) => result.state !== "same").map((result) => `${result.name}: ${result.note}`),
];

writeFileSync(`${ROOT}corpus/load-report.txt`, `${report.join("\n")}\n`);
console.log(report.slice(0, 4).join("\n"));
console.log(`The full report is in corpus/load-report.txt`);
