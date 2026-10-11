// Start: node bin/webrebol.mjs '<REBOL source text>'
// This program evaluates a REBOL source text. It shows the printed text, and then the molded result or the error.
import { interpretWithEdge } from "../src/edge/drive.mjs";
import { showResult } from "../src/natives/interpret.mjs";
import { findError, formatError } from "../src/natives/report.mjs";

const BATCHES = 5000;

/**
 * @uses findError (src/natives/report.mjs), showResult (src/natives/interpret.mjs),
 *   formatError (src/natives/report.mjs)
 * @usedby bin/webrebol.mjs
 */
const showEnd = (machine) => {
  const fault = machine.mode === "done" ? findError(machine) : null;
  process.stdout.write(machine.store.output);
  console.log(fault === null ? `== ${showResult(machine)}` : formatError(machine.store, fault));
};

interpretWithEdge(process.argv[2] ?? "", BATCHES).then(showEnd);
