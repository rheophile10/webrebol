// A table with whole numbers as keys. A change makes a new table that shares most of its parts with the old table.

const BITS = 5;
const WIDTH = 32;
const MASK = 31;
/**
 * @uses WIDTH
 * @usedby EMPTY_TABLE, writeNode, writeEntry
 */
const EMPTY_NODE = Array.from({ length: WIDTH });

/**
 * The table without entries.
 * @uses EMPTY_NODE
 * @usedby EMPTY_STORE
 */
export const EMPTY_TABLE = { shift: 0, root: EMPTY_NODE };

/**
 * @uses MASK, BITS
 * @usedby readEntry
 */
const readNode = (node, shift, key) => {
  // Go down one level for each group of 5 bits of the key.
  const child = node[(key >> shift) & MASK];
  return shift === 0 || child === undefined ? child : readNode(child, shift - BITS, key);
};

/**
 * Gets the value of a key.
 * @param {{ shift: number, root: Array }} table
 * @param {number} key - A whole number that is zero or more.
 * @returns {*}
 * @standard absent - A key without a value gives undefined.
 * @uses BITS, readNode
 * @usedby atEnd (src/machine/machine.mjs), readItem (src/machine/machine.mjs), readRest, readAll, readWord,
 *   readContext, writeWord
 */
export const readEntry = (table, key) => (key >> (table.shift + BITS) > 0 ? undefined : readNode(table.root, table.shift, key));

/**
 * @uses MASK, EMPTY_NODE, BITS
 * @usedby writeEntry
 */
const writeNode = (node, shift, entry) => {
  // Copy only the nodes on the path to the key. The other nodes are shared.
  const place = (entry.key >> shift) & MASK;
  const child = shift === 0 ? entry.value : writeNode(node[place] ?? EMPTY_NODE, shift - BITS, entry);
  return node.slice(0, place).concat([child], node.slice(place + 1));
};

/**
 * Makes a table in which a key has a new value.
 * @param {{ shift: number, root: Array }} table
 * @param {number} key - A whole number that is zero or more.
 * @param {*} value
 * @returns {{ shift: number, root: Array }}
 * @standard shared - The old table does not change.
 * @uses BITS, EMPTY_NODE, writeNode
 * @usedby EMPTY_STORE, makeSeries, writeAll, writeWord, writeContext
 */
export const writeEntry = (table, key, value) => {
  // A key that is too large for the table adds a level above the root.
  if (key >> (table.shift + BITS) > 0) {
    return writeEntry({ shift: table.shift + BITS, root: [table.root, ...EMPTY_NODE.slice(1)] }, key, value);
  }
  return { shift: table.shift, root: writeNode(table.root, table.shift, { key, value }) };
};
