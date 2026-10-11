// Start: node bin/webrebol.mjs '<REBOL source text>'
// This program loads a REBOL source text and shows the molded values.
import { loadSource } from "../src/load.mjs";
import { moldItems } from "../src/mold.mjs";

/**
 * @uses loadSource (src/load.mjs)
 * @usedby bin/webrebol.mjs
 */
const loaded = loadSource(process.argv[2] ?? "");

console.log(loaded.type === "error" ? `** ${loaded.value}` : moldItems(loaded.value));
