// The number tools of the reveal animations. This code is a copy of the grid tools of the animations project
// (stegosaurus/animations/src/reveals/grid.mjs), by the same author. An effect or an animation in REBOL can use them.
import { makeDatum } from "../data/datum.mjs";
import { giveValue } from "../machine/machine.mjs";

// The 8 × 8 Bayer matrix of the ordered dither.
const BAYER = [
  ...[0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26],
  ...[12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22],
  ...[3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25],
  ...[15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21],
];

/**
 * Gives the threshold of a cell in the ordered dither.
 * @param {number} column
 * @param {number} row
 * @returns {number}
 * @standard range - Each threshold is more than 0 and less than 1.
 * @uses BAYER
 * @usedby GRID_NATIVES
 */
export const findThreshold = (column, row) => (BAYER[(row % 8) * 8 + (column % 8)] + 0.5) / 64;

/**
 * Gives a number that looks random, and that is always the same for the same cell.
 * @param {number} column
 * @param {number} row
 * @returns {number}
 * @standard repeat - The same cell gives the same number, from 0 to 1.
 * @usedby smoothNoise, GRID_NATIVES
 */
export const hashCell = (column, row) => {
  const seed = Math.imul(column, 374761393) + Math.imul(row, 668265263);
  const mixed = Math.imul(seed ^ (seed >>> 13), 1274126177);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
};

/**
 * @usedby smoothNoise
 */
const mixValues = (start, end, part) => start + (end - start) * part * part * (3 - 2 * part);

/**
 * Gives noise that changes slowly from cell to cell.
 * @param {number} column
 * @param {number} row
 * @param {number} size - The size of one area of the noise, in cells.
 * @returns {number}
 * @standard range - Each number is from 0 to 1.
 * @uses mixValues, hashCell
 * @usedby GRID_NATIVES
 */
export const smoothNoise = (column, row, size) => {
  const left = Math.floor(column / size);
  const top = Math.floor(row / size);
  const across = column / size - left;
  const down = row / size - top;
  const upper = mixValues(hashCell(left, top), hashCell(left + 1, top), across);
  return mixValues(upper, mixValues(hashCell(left, top + 1), hashCell(left + 1, top + 1), across), down);
};

/**
 * Gives the distance of a cell from the center of a grid.
 * @param {{ column: number, row: number }} cell
 * @param {{ columns: number, rows: number }} grid
 * @returns {number}
 * @standard range - The distance is 0 at the center and 1 at a corner.
 * @usedby GRID_NATIVES
 */
export const measureCenter = (cell, grid) =>
  Math.hypot(cell.column + 0.5 - grid.columns / 2, cell.row + 0.5 - grid.rows / 2) / Math.hypot(grid.columns / 2, grid.rows / 2);

/**
 * @uses giveValue (src/machine/machine.mjs), makeDatum (src/data/datum.mjs)
 * @usedby GRID_NATIVES
 */
const giveDecimal = (machine, number) => giveValue(machine, makeDatum("decimal", number));

/**
 * The grid words: the natives that give the numbers of an animation. These words are not in REBOL 2.
 * @uses giveDecimal, findThreshold, hashCell, smoothNoise, measureCenter
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const GRID_NATIVES = {
  "find-threshold": (machine, [cell]) => giveDecimal(machine, findThreshold(cell.value[0], cell.value[1])),
  "hash-cell": (machine, [cell]) => giveDecimal(machine, hashCell(cell.value[0], cell.value[1])),
  "smooth-noise": (machine, [cell, size]) => giveDecimal(machine, smoothNoise(cell.value[0], cell.value[1], size.value)),
  "measure-center": (machine, [cell, grid]) =>
    giveDecimal(machine, measureCenter({ column: cell.value[0], row: cell.value[1] }, { columns: grid.value[0], rows: grid.value[1] })),
};

/**
 * The parameters of the grid words, as REBOL text. A cell and a grid size are pairs.
 */
export const GRID_SPECS = {
  "find-threshold": ["native", "cell [pair!]"],
  "hash-cell": ["native", "cell [pair!]"],
  "smooth-noise": ["native", "cell [pair!] size [number!]"],
  "measure-center": ["native", "cell [pair!] grid [pair!]"],
};
