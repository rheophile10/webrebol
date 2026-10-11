// Start: node bin/conform.mjs          (use the outcomes of REBOL that are in corpus/tests-reference.json)
// Start: node bin/conform.mjs record   (run REBOL again)
// This program runs the public REBOL core test suite (corpus/github/rebolsource_rebol-test/core-tests.r)
// in REBOL View 2.7.8 (in Docker, without a network) and in WebRebol. It compares the outcome of each test.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { loadSource } from "../src/data/load.mjs";
import { allocate, readRest } from "../src/store/store.mjs";
import { makeMachine } from "../src/machine/machine.mjs";
import { driveMachine } from "../src/edge/drive.mjs";
import { START_STORE } from "../src/session/globals.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
/**
 * @uses ROOT
 * @usedby tests
 */
const SUITE = `${ROOT}corpus/github/rebolsource_rebol-test/core-tests.r`;
const LIMITS = { encoding: "latin1", timeout: 600000, maxBuffer: 256 * 1024 * 1024 };
const SKIP_FLAGS = ["#r3only", "#r3", "#64bit", "#long"];
const BATCHES = 3000;

/**
 * @usedby runDocker
 */
const writeHex = (text) => Buffer.from(text, "latin1").toString("hex").toUpperCase();

/**
 * @uses SKIP_FLAGS
 * @usedby tests
 */
const readTests = (text) => {
  // A test starts with "[" at the start of a line. A test of more than one line ends with a line that is only "]".
  const addLine = (state, line) => {
    if (state.open !== null) {
      const open = [...state.open, line];
      return line === "]" ? { ...state, open: null, flags: [], tests: [...state.tests, { flags: state.flags, source: open.join("\n") }] } : { ...state, open };
    }
    if (line.startsWith("#")) return { ...state, flags: [...state.flags, line.trim()] };
    if (!line.startsWith("[")) return state;
    if (!line.trimEnd().endsWith("]")) return { ...state, open: [line] };
    return { ...state, flags: [], tests: [...state.tests, { flags: state.flags, source: line }] };
  };
  const all = text.replace(/\r\n/g, "\n").split("\n").reduce(addLine, { open: null, flags: [], tests: [] }).tests;
  return all.map((test, place) => ({ ...test, index: place + 1 })).filter((test) => !test.flags.some((flag) => SKIP_FLAGS.includes(flag)));
};

/**
 * @uses writeHex, ROOT, LIMITS
 * @usedby runReference
 */
const runDocker = (tests) => {
  // Run the tests in one REBOL session. If REBOL stops, the output has the outcomes before the stop.
  const folder = mkdtempSync(`${tmpdir()}/webrebol-tests-`);
  writeFileSync(`${folder}/tests.hex`, tests.map((test) => `${test.index} ${writeHex(test.source)}\n`).join(""));
  const mounts = ["-v", `${ROOT}reference/rebol-view-278-4-3/releases/rebol-view:/rebol:ro`, "-v", `${ROOT}reference:/work:ro`, "-v", `${folder}:/cases:ro`];
  const result = spawnSync("docker", ["run", "--rm", "--init", "--network", "none", "--entrypoint", "/work/corpus-tests.sh", ...mounts, "webrebol-rebview"], LIMITS);
  rmSync(folder, { recursive: true });
  return result.stdout ?? "";
};

/**
 * @uses runDocker
 * @usedby reference
 */
const runReference = (tests, outcomes = {}) => {
  // A test that stops REBOL gets the outcome STOP. Then a new REBOL session continues with the next test.
  if (tests.length === 0) return outcomes;
  const found = Object.fromEntries([...runDocker(tests).matchAll(/@@T (\d+) ([^\n]*)/g)].map((match) => [match[1], match[2].trim()]));
  const done = tests.filter((test) => found[test.index] !== undefined).length;
  const stopped = tests[done];
  const next = { ...outcomes, ...found, ...(stopped === undefined ? {} : { [stopped.index]: "STOP" }) };
  return runReference(tests.slice(done + 1), next);
};

/**
 * @usedby runTest
 */
const showOutcome = (machine) => {
  if (machine.mode !== "done") return "BUDGET";
  const thrown = machine.thrown?.kind === "error" ? machine.thrown.value : null;
  const fault = thrown ?? (machine.value.type === "error" ? machine.value : null);
  if (fault !== null) return `ERROR ${fault.value}`;
  if (machine.value.type === "unset") return "unset";
  return machine.value.type === "logic" ? String(machine.value.value) : `OTHER ${machine.value.type}`;
};

/**
 * @uses START_STORE (src/session/globals.mjs), loadSource (src/data/load.mjs), allocate (src/store/store.mjs),
 *   driveMachine (src/edge/drive.mjs), makeMachine (src/machine/machine.mjs), readRest (src/store/store.mjs),
 *   BATCHES, showOutcome
 * @usedby bin/conform.mjs
 */
const runTest = (stops) => async (before, test) => {
  // The tests run in one session, as in REBOL. After a test that stops REBOL, the session is new, as in REBOL.
  const given = await before;
  const state = stops.includes(test.index - 1) || stops.includes(test.index) ? { ...given, store: START_STORE } : given;
  try {
    const loaded = loadSource(test.source);
    if (loaded.type === "error") return { store: state.store, outcomes: { ...state.outcomes, [test.index]: `ERROR ${loaded.value}` } };
    // The text of a test is one block. The machine evaluates the content of that block, with the edge for the clock and Web Crypto.
    const made = allocate(state.store, loaded);
    const done = await driveMachine(makeMachine(made.store, readRest(made.store, made.value)[0]), BATCHES);
    return { store: done.mode === "done" ? done.store : state.store, outcomes: { ...state.outcomes, [test.index]: showOutcome(done) } };
  } catch (fault) {
    return { store: state.store, outcomes: { ...state.outcomes, [test.index]: `CRASH ${String(fault.message).slice(0, 60)}` } };
  }
};

/**
 * @uses readTests, SUITE
 * @usedby reference, bin/conform.mjs, stops, writeReport
 */
const tests = readTests(readFileSync(SUITE, "latin1"));
/**
 * @uses runReference, tests
 * @usedby stops, judged, same, different, lines
 */
// The outcomes of REBOL do not change. Keep them in a file, and run REBOL again only with the argument "record".
/**
 * @uses ROOT
 * @usedby cached, reference, bin/conform.mjs
 */
const CACHE = `${ROOT}corpus/tests-reference.json`;
/**
 * @uses CACHE
 * @usedby reference
 */
const cached = process.argv[2] !== "record" && existsSync(CACHE);
/**
 * @uses cached, CACHE, runReference, tests
 * @usedby bin/conform.mjs, stops, writeReport
 */
const reference = cached ? JSON.parse(readFileSync(CACHE, "utf8")) : runReference(tests);
writeFileSync(CACHE, JSON.stringify(reference));
/**
 * @uses tests, reference
 * @usedby bin/conform.mjs, writeReport
 */
const stops = tests.filter((test) => reference[test.index] === "STOP").map((test) => test.index);
/**
 * @uses tests, runTest, stops, START_STORE (src/session/globals.mjs)
 * @usedby same, different, lines
 */
/**
 * @uses tests, reference, stops, ROOT
 * @usedby bin/conform.mjs
 */
const writeReport = (actual) => {
  const judged = tests.filter((test) => reference[test.index] !== undefined && reference[test.index] !== "STOP");
  /**
   * @uses judged, reference, actual
   * @usedby summary
   */
  const same = judged.filter((test) => reference[test.index] === actual[test.index]);
  /**
   * @uses judged, reference, actual
   * @usedby lines, summary
   */
  const different = judged.filter((test) => reference[test.index] !== actual[test.index]);
  /**
   * @uses different, reference, actual
   * @usedby bin/conform.mjs
   */
  const lines = different.map((test) => `${test.index}: REBOL ${reference[test.index]} | WebRebol ${actual[test.index]} | ${test.source.replace(/\s+/g, " ").slice(0, 110)}`);
  /**
   * @uses tests, stops, judged, same, different
   * @usedby bin/conform.mjs
   */
  const summary = [
    `Tests for REBOL 2 in the suite: ${tests.length}`,
    `Tests that stop REBOL 2.7.8 itself: ${stops.length}`,
    `Tests with an outcome from REBOL: ${judged.length}`,
    `Same outcome in WebRebol: ${same.length}`,
    `Different outcome in WebRebol: ${different.length}`,
  ];
  
  writeFileSync(`${ROOT}corpus/tests-report.txt`, `${[...summary, "", ...lines].join("\n")}\n`);
  console.log(summary.join("\n"));
  console.log("The full report is in corpus/tests-report.txt");
};

tests.reduce(runTest(stops), Promise.resolve({ store: START_STORE, outcomes: {} })).then((state) => writeReport(state.outcomes));
