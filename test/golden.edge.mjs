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
  // A line has the source and the result of REBOL, each as hexadecimal text.
  const [source, expected = ""] = line.split(" ").map(readHex);
  return { source, expected };
};

/**
 * Reads the cases of one group and the results that REBOL 2.7.8 gave for them.
 * @param {string} name - The name of the group.
 * @returns {{ source: string, expected: string }[]}
 * @uses readCase
 * @usedby findProblems
 */
export const readGolden = (name) =>
  readFileSync(new URL(`./golden/${name}`, import.meta.url), "latin1").trim().split("\n").map(readCase);
