// Start: node bin/webrebol.mjs '<REBOL source text>'
// This program evaluates a REBOL source text. It shows the printed text, and then the molded result or the error.
// If the environment variable WEBREBOL_DISK names a folder, the folder is the disk of the session.
import { interpretWithEdge } from "../src/edge/drive.mjs";
import { readFolder, writeFolder } from "../src/edge/folder.mjs";
import { showResult } from "../src/session/interpret.mjs";
import { findError, formatError } from "../src/natives/report.mjs";
import { EMPTY_DISK } from "../src/store/disk.mjs";

const BATCHES = 5000;
const ROOT = process.env.WEBREBOL_DISK ?? null;
/**
 * @uses ROOT, EMPTY_DISK (src/store/disk.mjs), readFolder (src/edge/folder.mjs)
 * @usedby showEnd, bin/webrebol.mjs
 */
const DISK = ROOT === null ? EMPTY_DISK : readFolder(ROOT);

/**
 * @uses findError (src/natives/report.mjs), ROOT, writeFolder (src/edge/folder.mjs), DISK,
 *   showResult (src/session/interpret.mjs), formatError (src/natives/report.mjs)
 * @usedby bin/webrebol.mjs
 */
const showEnd = (machine) => {
  // Save the files that the session changed, then show the end of the evaluation.
  const fault = machine.mode === "done" ? findError(machine) : null;
  const written = ROOT === null ? [] : writeFolder(ROOT, DISK, machine.store.disk);
  process.stdout.write(machine.store.output);
  console.log(fault === null ? `== ${showResult(machine)}` : formatError(machine.store, fault));
  return written;
};

interpretWithEdge(process.argv[2] ?? "", BATCHES, DISK).then(showEnd);
