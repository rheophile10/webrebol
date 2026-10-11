// Start: node bin/webrebol.mjs '<REBOL source text>'
// This program evaluates a REBOL source text. It shows the printed text, and then the molded result or the error.
import { interpretSource, showResult } from "../src/natives/interpret.mjs";
import { findError, formatError } from "../src/natives/report.mjs";

const BATCHES = 5000;
/**
 * @uses interpretSource (src/natives/interpret.mjs), BATCHES
 * @usedby fault, bin/webrebol.mjs
 */
const machine = interpretSource(process.argv[2] ?? "", BATCHES);
/**
 * @uses machine, findError (src/natives/report.mjs)
 * @usedby bin/webrebol.mjs
 */
const fault = machine.mode === "done" ? findError(machine) : null;

process.stdout.write(machine.store.output);
console.log(fault === null ? `== ${showResult(machine)}` : formatError(machine.store, fault));
