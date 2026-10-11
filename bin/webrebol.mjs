// Start: node bin/webrebol.mjs '<REBOL source text>'
// This program evaluates a REBOL source text. It shows the printed text and then the molded result.
import { interpretSource, showResult } from "../src/natives/interpret.mjs";

const BATCHES = 5000;
/**
 * @uses interpretSource (src/natives/interpret.mjs), BATCHES
 * @usedby bin/webrebol.mjs
 */
const machine = interpretSource(process.argv[2] ?? "", BATCHES);

process.stdout.write(machine.store.output);
console.log(`== ${showResult(machine)}`);
