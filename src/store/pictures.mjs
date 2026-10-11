/** @import { Datum, Store } from "../types/states.mjs" */
/** @import { Pixel } from "../types/values.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { packPixel, unpackPixel } from "../data/pixels.mjs";
import { readEntry, writeEntry } from "./table.mjs";

// The store keeps the pixels of an image in rows. A change makes new arrays only for the rows that change.

/**
 * Gets the rows of an image.
 * @param {Store} store
 * @param {Datum} image
 * @returns {Pixel[][]}
 * @standard shared - A row that did not change is the same array as before the change.
 * @uses readEntry
 * @usedby complementImage (src/natives/numbers.mjs), readPixel, writePixel, drawOnImage (src/view/raster.mjs)
 */
export const readRows = (store, image) => readEntry(store.series, image.value.id);

/**
 * Makes a store in which an image has new rows.
 * @param {Store} store
 * @param {Datum} image
 * @param {Pixel[][]} rows
 * @returns {Store}
 * @uses writeEntry
 * @usedby writePixel, drawOnImage (src/view/raster.mjs)
 */
export const writeRows = (store, image, rows) => ({ ...store, series: writeEntry(store.series, image.value.id, rows) });

/**
 * Gets one pixel of an image as a tuple value.
 * @param {Store} store
 * @param {Datum} image
 * @param {number} place - The position of the pixel, counted from zero.
 * @returns {Datum | null}
 * @standard outside - A position that is not in the image gives null.
 * @uses readRows, makeDatum (src/data/datum.mjs), unpackPixel (src/data/pixels.mjs)
 * @usedby selectInImage (src/machine/path.mjs), pickItem (src/natives/series.mjs), pickIndex (src/natives/series.mjs)
 */
export const readPixel = (store, image, place) => {
  const rows = readRows(store, image);
  const width = Math.max(rows[0]?.length ?? 1, 1);
  const pixel = place < 0 ? undefined : rows[Math.floor(place / width)]?.[place % width];
  return pixel === undefined ? null : makeDatum("tuple", unpackPixel(pixel));
};

/**
 * Makes a store in which one pixel of an image has a new color.
 * @param {Store} store
 * @param {Datum} image
 * @param {{ place: number, color: number[] }} change - The position of the pixel, and the bytes of the REBOL color.
 * @returns {Store}
 * @standard row - Only the row of the pixel is a new array.
 * @uses readRows, packPixel (src/data/pixels.mjs), writeRows
 * @usedby pokeItem (src/natives/edit.mjs)
 */
export const writePixel = (store, image, change) => {
  const rows = readRows(store, image);
  const width = Math.max(rows[0]?.length ?? 1, 1);
  const [line, column] = [Math.floor(change.place / width), change.place % width];
  const changeRow = (row) => row.slice(0, column).concat([packPixel(change.color)], row.slice(column + 1));
  return writeRows(store, image, rows.map((row, place) => (place === line ? changeRow(row) : row)));
};
