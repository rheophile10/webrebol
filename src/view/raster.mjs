/** @import { Datum, Store } from "../types/states.mjs" */
/** @import { Pixel } from "../types/values.mjs" */
import { readRest } from "../store/store.mjs";
import { readRows, writeRows } from "../store/pictures.mjs";
import { giveValue } from "../machine/machine.mjs";
import { packPixel } from "../data/pixels.mjs";

const SWEEP_LIMIT = 64;
/**
 * @uses packPixel (src/data/pixels.mjs)
 * @usedby drawCommands
 */
const START = { pen: packPixel([0, 0, 0, 0]), fill: null, width: 1, mode: null, last: null };

/**
 * @uses packPixel (src/data/pixels.mjs)
 * @usedby SETTERS
 */
const readColor = (tuple) => packPixel(tuple.value);

/**
 * @usedby drawSegment
 */
const measureSegment = (point, from, target) => {
  // The distance from a point to the nearest point of a segment.
  const [across, down] = [target[0] - from[0], target[1] - from[1]];
  const span = across * across + down * down;
  const part = span === 0 ? 0 : Math.min(1, Math.max(0, ((point[0] - from[0]) * across + (point[1] - from[1]) * down) / span));
  return Math.hypot(point[0] - from[0] - part * across, point[1] - from[1] - part * down);
};

/**
 * @usedby drawSegment, drawBox, drawCircle
 */
const paintArea = (picture, area, test) => {
  // Change only the rows of the area, and test only the columns of the area. The other rows are the same arrays as before.
  const [left, right] = [Math.max(0, Math.floor(area.left)), Math.ceil(area.right) + 1];
  const paintRow = (row, line) => {
    const span = row.slice(left, right);
    const part = span.map((pixel, place) => (test(left + place, line) ? area.color : pixel));
    return part.some((pixel, place) => pixel !== span[place]) ? row.slice(0, left).concat(part, row.slice(right)) : row;
  };
  const isTouched = (line) => line >= Math.floor(area.top) && line <= Math.ceil(area.bottom);
  return { ...picture, rows: picture.rows.map((row, line) => (isTouched(line) ? paintRow(row, line) : row)) };
};

/**
 * @uses paintArea, measureSegment
 * @usedby SHAPES
 */
const drawSegment = (picture, state, target) => {
  // A line is all the pixels that are near the segment. Thus a line has round ends.
  const from = state.last ?? target;
  const reach = Math.max(state.width / 2, 0.5);
  const sides = { left: Math.min(from[0], target[0]) - reach, right: Math.max(from[0], target[0]) + reach };
  const area = { ...sides, top: Math.min(from[1], target[1]) - reach, bottom: Math.max(from[1], target[1]) + reach, color: state.pen };
  return paintArea(picture, area, (column, row) => measureSegment([column, row], from, target) <= reach);
};

/**
 * @uses paintArea
 * @usedby SHAPES
 */
const drawBox = (picture, state, corner) => {
  const [left, right] = [Math.min(state.last[0], corner[0]), Math.max(state.last[0], corner[0])];
  const area = { left, right, top: Math.min(state.last[1], corner[1]), bottom: Math.max(state.last[1], corner[1]), color: state.fill ?? state.pen };
  return paintArea(picture, area, () => true);
};

/**
 * @uses paintArea
 * @usedby drawItem
 */
const drawCircle = (picture, state, radius) => {
  // With a fill pen, the circle is full. Without it, the circle is a ring of the line width.
  const center = state.last;
  const reach = radius + state.width;
  const sides = { left: center[0] - reach, right: center[0] + reach };
  const area = { ...sides, top: center[1] - reach, bottom: center[1] + reach, color: state.fill ?? state.pen };
  const inside = (column, row) => {
    const distance = Math.hypot(column - center[0], row - center[1]);
    return state.fill === null ? Math.abs(distance - radius) <= Math.max(state.width / 2, 0.5) : distance <= radius;
  };
  return paintArea(picture, area, inside);
};

/**
 * @usedby fillRow
 */
const hasSeed = (run, offset) => (seeds) => {
  const found = seeds.indexOf("1", offset);
  return found !== -1 && found < offset + run.length;
};

/**
 * @uses hasSeed
 * @usedby sweepRows
 */
const fillRow = (open, seedRows) =>
  // In one row, each run of open pixels that touches a seed becomes filled. The seeds are in the row and in the row before it.
  open.replace(/1+/g, (run, offset) => (seedRows.some(hasSeed(run, offset)) ? run : "0".repeat(run.length)));

/**
 * @uses fillRow
 * @usedby growFill
 */
const sweepRows = (open, filled) => {
  // Go down the rows. Each row takes seeds from itself and from the row above it.
  const addRow = (rows, row, place) => [...rows, fillRow(open[place], place === 0 ? [row] : [row, rows[place - 1]])];
  return filled.reduce(addRow, []);
};

/**
 * @uses sweepRows
 * @usedby floodFill
 */
const growFill = (open, filled, sweeps) => {
  // Sweep down and then up, until a sweep changes nothing.
  const down = sweepRows(open, filled);
  const back = [...sweepRows([...open].reverse(), [...down].reverse())].reverse();
  return sweeps <= 0 || back.join("") === filled.join("") ? back : growFill(open, back, sweeps - 1);
};

/**
 * @uses growFill, SWEEP_LIMIT
 * @usedby SHAPES
 */
const floodFill = (picture, state, point) => {
  // The fill changes the pixels that have the color of the start pixel and that are joined to it.
  const [width, height] = picture.size;
  const start = picture.rows[point[1]]?.[point[0]];
  if (start === undefined || start === state.pen) return picture;
  const markRow = (unused, line) => picture.rows[line].map((pixel) => (pixel === start ? "1" : "0")).join("");
  const empty = "0".repeat(width);
  const seedRow = `${"0".repeat(point[0])}1${"0".repeat(width - point[0] - 1)}`;
  const seeds = Array.from({ length: height }, (unused, row) => (row === point[1] ? seedRow : empty));
  const filled = growFill(Array.from({ length: height }, markRow), seeds, SWEEP_LIMIT);
  // A row without a filled pixel stays the same array.
  const fillPixels = (row, line) => row.map((pixel, column) => (filled[line][column] === "1" ? state.pen : pixel));
  return { ...picture, rows: picture.rows.map((row, line) => (filled[line].includes("1") ? fillPixels(row, line) : row)) };
};

/**
 * @uses readColor
 * @usedby drawItem
 */
const SETTERS = {
  pen: (state, item) => ({ ...state, pen: readColor(item), mode: null }),
  "fill-pen": (state, item) => ({ ...state, fill: item.type === "tuple" ? readColor(item) : null, mode: null }),
  "line-width": (state, item) => ({ ...state, width: item.value, mode: null }),
};

/**
 * @uses drawSegment, drawBox, floodFill
 * @usedby drawItem
 */
const SHAPES = { line: drawSegment, box: drawBox, flood: floodFill };

/**
 * @uses SETTERS, drawCircle, SHAPES
 * @usedby drawCommands
 */
const drawItem = (drawing, item) => {
  // A word starts a command. A value after a setting changes the setting. A point after a shape draws.
  const state = drawing.state;
  if (item.type === "word") return { ...drawing, state: { ...state, mode: item.value.toLowerCase(), last: null } };
  if (SETTERS[state.mode] !== undefined) return { ...drawing, state: SETTERS[state.mode](state, item) };
  if (state.mode === "circle" && item.type !== "pair") return { picture: drawCircle(drawing.picture, state, item.value), state };
  const first = state.last === null && state.mode !== "line" && state.mode !== "flood";
  const picture = first || SHAPES[state.mode] === undefined ? drawing.picture : SHAPES[state.mode](drawing.picture, state, item.value);
  return { picture, state: { ...state, last: item.value } };
};

/**
 * Draws commands on the pixels of an image: pen, fill-pen, line-width, line, box, circle and flood.
 * @param {{ size: number[], rows: Pixel[][] }} picture - The size of the image and the rows of its pixels.
 * @param {Datum[]} commands - The values of the draw block.
 * @returns {{ size: number[], rows: Pixel[][] }}
 * @standard line - A line changes the pixels near each segment to the color of the pen.
 * @standard flood - A flood changes the joined pixels that have the color of the start pixel.
 * @standard shared - A row that the commands do not touch is the same array as before.
 * @uses drawItem, START
 * @usedby drawOnImage
 */
export const drawCommands = (picture, commands) => commands.reduce(drawItem, { picture, state: START }).picture;

/**
 * @uses readRows (src/store/pictures.mjs), drawCommands, readRest (src/store/store.mjs),
 *   giveValue (src/machine/machine.mjs), writeRows (src/store/pictures.mjs)
 * @usedby RASTER_NATIVES
 */
const drawOnImage = (machine, [image, commands]) => {
  // The image changes. The result is the image.
  const picture = { size: image.value.size, rows: readRows(machine.store, image) };
  const drawn = drawCommands(picture, readRest(machine.store, commands));
  return giveValue({ ...machine, store: writeRows(machine.store, image, drawn.rows) }, image);
};

/**
 * The natives that draw on an image. Each entry has the name of REBOL and the function.
 * @uses drawOnImage
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const RASTER_NATIVES = {
  draw: drawOnImage,
};
