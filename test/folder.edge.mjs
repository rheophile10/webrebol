import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

/**
 * Makes a new empty folder for one test.
 * @returns {string}
 */
export const makeTestFolder = () => mkdtempSync(`${tmpdir()}/webrebol-test-`);

/**
 * Removes the folder of a test and all that is in it.
 * @param {string} root
 * @returns {void}
 */
export const removeTestFolder = (root) => rmSync(root, { recursive: true });

/**
 * Reads a file of the computer as text.
 * @param {string} path
 * @returns {string}
 */
export const readTestFile = (path) => readFileSync(path, "latin1");
