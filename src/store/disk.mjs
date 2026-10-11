// The disk of a session: a table of files and folders, by their full path. All functions are pure.

const FOLDER = { kind: "folder" };

/**
 * The disk at the start of a session. It has only the root folder.
 * @uses FOLDER
 * @usedby DISK (bin/webrebol.mjs), interpretWithEdge (src/edge/drive.mjs), EMPTY_STORE,
 *   makeScript (test/disk.test.mjs)
 */
export const EMPTY_DISK = { "/": FOLDER };

/**
 * @usedby resolvePath
 */
const addPart = (parts, part) => {
  // A point is the same folder. Two points are the folder above.
  if (part === "" || part === ".") return parts;
  return part === ".." ? parts.slice(0, -1) : [...parts, part];
};

/**
 * Makes the full path of a file name. A name that does not start with "/" is in the current folder.
 * @param {string} directory - The current folder. It ends with "/".
 * @param {string} name - The file name, as the text of a REBOL file value.
 * @returns {string}
 * @standard clean - The result has no "." part, no ".." part, and no "/" at its end, but the root is "/".
 * @uses addPart
 * @usedby readPath (src/natives/files.mjs), FILE_NATIVES (src/natives/files.mjs)
 */
export const resolvePath = (directory, name) => {
  const full = name.startsWith("/") ? name : `${directory}${name}`;
  return `/${full.split("/").reduce(addPart, []).join("/")}`;
};

/**
 * @usedby writeFile, makeFolder, renameEntry
 */
const findParent = (path) => path.slice(0, path.lastIndexOf("/")) || "/";

/**
 * @usedby listFolder, writeFile, makeFolder, renameEntry
 */
const isFolder = (disk, path) => disk[path]?.kind === "folder";

/**
 * Lists the names in a folder. The name of a folder ends with "/".
 * @param {Object<string, object>} disk
 * @param {string} path - The full path of the folder.
 * @returns {string[]}
 * @standard direct - The list has only the entries directly in the folder, in the sequence of the alphabet.
 * @uses isFolder
 * @usedby readSource (src/natives/files.mjs), removeEntry
 */
export const listFolder = (disk, path) => {
  const prefix = path === "/" ? "/" : `${path}/`;
  const inside = Object.keys(disk).filter((key) => key !== "/" && key.startsWith(prefix) && !key.slice(prefix.length).includes("/"));
  return [...inside.map((key) => `${key.slice(prefix.length)}${isFolder(disk, key) ? "/" : ""}`)].sort();
};

/**
 * Puts a file on the disk. The folder of the file must be there, and the path must not be a folder.
 * @param {Object<string, object>} disk
 * @param {string} path - The full path of the file.
 * @param {{ bytes: number[], modified: number }} file - The content and the time of the change in milliseconds.
 * @returns {Object<string, object> | null}
 * @standard parent - A file in a folder that is not on the disk gives null.
 * @uses isFolder, findParent
 * @usedby writeTarget (src/natives/files.mjs), makeScript (test/disk.test.mjs)
 */
export const writeFile = (disk, path, file) =>
  !isFolder(disk, findParent(path)) || isFolder(disk, path) ? null : { ...disk, [path]: { kind: "file", ...file } };

/**
 * Puts a folder on the disk. With deep, the folders above it are also made.
 * @param {Object<string, object>} disk
 * @param {string} path - The full path of the folder.
 * @param {boolean} deep
 * @returns {Object<string, object> | null}
 * @standard parent - Without deep, a folder in a folder that is not on the disk gives null.
 * @uses isFolder, findParent, FOLDER
 * @usedby makeDirectory (src/natives/files.mjs)
 */
export const makeFolder = (disk, path, deep) => {
  if (isFolder(disk, path)) return disk;
  if (disk[path] !== undefined) return null;
  const above = deep ? makeFolder(disk, findParent(path), true) : disk;
  return above === null || !isFolder(above, findParent(path)) ? null : { ...above, [path]: FOLDER };
};

/**
 * Removes a file or a folder from the disk. With deep, a folder goes with all that is in it.
 * @param {Object<string, object>} disk
 * @param {string} path
 * @param {boolean} deep
 * @returns {Object<string, object> | null}
 * @standard full - Without deep, a folder that is not empty gives null. An entry that is not there gives null.
 * @uses listFolder
 * @usedby deleteEntry (src/natives/files.mjs), FILE_NATIVES (src/natives/files.mjs)
 */
export const removeEntry = (disk, path, deep) => {
  const blocked = disk[path] === undefined || path === "/" || (!deep && listFolder(disk, path).length > 0);
  if (blocked) return null;
  const kept = Object.entries(disk).filter(([key]) => key !== path && !key.startsWith(`${path}/`));
  return Object.fromEntries(kept);
};

/**
 * Gives an entry of the disk a new path.
 * @param {Object<string, object>} disk
 * @param {string} from - The full path of the entry.
 * @param {string} target - The new full path.
 * @returns {Object<string, object> | null}
 * @standard absent - An entry that is not there gives null.
 * @uses isFolder, findParent
 * @usedby FILE_NATIVES (src/natives/files.mjs)
 */
export const renameEntry = (disk, from, target) => {
  if (disk[from] === undefined || !isFolder(disk, findParent(target))) return null;
  const move = ([key, entry]) => [key === from || key.startsWith(`${from}/`) ? `${target}${key.slice(from.length)}` : key, entry];
  return Object.fromEntries(Object.entries(disk).map(move));
};
