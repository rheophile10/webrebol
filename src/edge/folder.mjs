import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";

/**
 * @usedby readFolder
 */
const readEntry = (root, path) => {
  // A folder gives its entry and the entries of all that is in it.
  const real = `${root}${path}`;
  const facts = statSync(real);
  if (!facts.isDirectory()) return [[path, { kind: "file", bytes: [...readFileSync(real)], modified: Math.floor(facts.mtimeMs) }]];
  const inside = readdirSync(real).flatMap((name) => readEntry(root, `${path === "/" ? "" : path}/${name}`));
  return [[path, { kind: "folder" }], ...inside];
};

/**
 * Reads a folder of the computer as the disk of a session.
 * @param {string} root - The path of the folder, without "/" at its end.
 * @returns {Object<string, object>}
 * @standard root - The folder itself is the entry "/" of the disk.
 * @uses readEntry
 * @usedby DISK (bin/webrebol.mjs)
 */
export const readFolder = (root) => {
  mkdirSync(root, { recursive: true });
  return Object.fromEntries(readEntry(root, "/"));
};

/**
 * Writes the changes of a disk to a folder of the computer.
 * @param {string} root - The path of the folder, without "/" at its end.
 * @param {Object<string, object>} before - The disk at the start of the session.
 * @param {Object<string, object>} after - The disk at the end of the session.
 * @returns {string[]}
 * @standard changes - Only an entry that is new, changed or removed is written. The result lists these paths.
 * @usedby showEnd (bin/webrebol.mjs)
 */
export const writeFolder = (root, before, after) => {
  const removed = Object.keys(before).filter((path) => after[path] === undefined);
  const changed = Object.keys(after).filter((path) => after[path] !== before[path]);
  removed.filter((path) => existsSync(`${root}${path}`)).forEach((path) => rmSync(`${root}${path}`, { recursive: true }));
  const folders = [...changed.filter((path) => after[path].kind === "folder")].sort();
  folders.forEach((path) => mkdirSync(`${root}${path}`, { recursive: true }));
  const files = changed.filter((path) => after[path].kind === "file");
  files.forEach((path) => writeFileSync(`${root}${path}`, Buffer.from(after[path].bytes)));
  return [...removed, ...changed];
};
