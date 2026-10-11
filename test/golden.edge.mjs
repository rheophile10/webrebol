import { readFileSync } from "node:fs";

/**
 * @usedby readCase
 */
const readHex = (hex) => Buffer.from(hex, "hex").toString("latin1");

/**
 * @uses readHex
 * @usedby readGolden
 */
const readCase = (line) => {
  // A line has the source, the result of REBOL and the printed text, each as hexadecimal text.
  const [source, expected = "", output = ""] = line.split(" ").map(readHex);
  return { source, expected, output };
};

/**
 * Reads the cases of one group and the results that REBOL 2.7.8 gave for them.
 * @param {string} name - The folder and the name of the group, for example "do/math.txt".
 * @returns {{ source: string, expected: string, output: string }[]}
 * @uses readCase
 * @usedby findProblems, findProblems, findProblems
 */
export const readGolden = (name) =>
  readFileSync(new URL(`./golden/${name}`, import.meta.url), "latin1").trim().split("\n").map(readCase);
