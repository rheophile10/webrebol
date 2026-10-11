// A list that grows in groups of 64 items. An item at the end copies one small group, not the full list.

const GROUP_SIZE = 64;

/**
 * The list without items.
 */
export const EMPTY_CHUNKS = { full: [], last: [] };

/**
 * Makes a list that has one more item at its end.
 * @param {{ full: Array[], last: Array }} chunks
 * @param {*} item
 * @returns {{ full: Array[], last: Array }}
 * @standard shared - The old list does not change.
 * @uses GROUP_SIZE
 * @usedby addDatum, allocateItem (src/store/store.mjs)
 */
export const pushItem = (chunks, item) =>
  chunks.last.length < GROUP_SIZE
    ? { full: chunks.full, last: [...chunks.last, item] }
    : { full: [...chunks.full, chunks.last], last: [item] };

/**
 * Makes one array from the items of a list.
 * @param {{ full: Array[], last: Array }} chunks
 * @returns {Array}
 * @standard sequence - The items are in the sequence in which they came.
 * @usedby closeFrame, loadSource, allocate (src/store/store.mjs)
 */
export const joinChunks = (chunks) => [...chunks.full.flat(), ...chunks.last];
