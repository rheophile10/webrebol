/** @import { Datum, Store } from "../types/states.mjs" */
import { readAll, readRest, writeAll } from "../store/store.mjs";
import { giveValue } from "../machine/machine.mjs";

const SWEEP_LIMIT = 64;
const START = { pen: [0, 0, 0, 0], fill: null, width: 1, mode: null, last: null };

// In REBOL, the alpha value 0 is a pixel that is not transparent.
/**
 * @usedby SETTERS
 */
const readColor = (tuple) => [tuple.value[0] ?? 0, tuple.value[1] ?? 0, tuple.value[2] ?? 0, tuple.value[3] ?? 0];

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
  // Change only the rows of the area. The rows above and below it are the same arrays as before.
  const width = picture.size[0];
  const top = Math.max(0, Math.floor(area.top));
  const bottom = Math.min(picture.size[1] - 1, Math.ceil(area.bottom));
  if (bottom < top) return picture;
  const paintPixel = (pixel, place) => (test(place % width, top + Math.floor(place / width)) ? area.color : pixel);
  const rows = picture.pixels.slice(top * width, (bottom + 1) * width).map(paintPixel);
  return { ...picture, pixels: picture.pixels.slice(0, top * width).concat(rows, picture.pixels.slice((bottom + 1) * width)) };
};

/**
 * @uses paintArea, measureSegment
 * @usedby SHAPES
 */
const drawSegment = (picture, state, target) => {
  // A line is all the pixels that are near the segment. Thus a line has round ends.
  const from = state.last ?? target;
  const reach = Math.max(state.width / 2, 0.5);
  const area = { top: Math.min(from[1], target[1]) - reach, bottom: Math.max(from[1], target[1]) + reach, color: state.pen };
  return paintArea(picture, area, (column, row) => measureSegment([column, row], from, target) <= reach);
};

/**
 * @uses paintArea
 * @usedby SHAPES
 */
const drawBox = (picture, state, corner) => {
  const [left, right] = [Math.min(state.last[0], corner[0]), Math.max(state.last[0], corner[0])];
  const area = { top: Math.min(state.last[1], corner[1]), bottom: Math.max(state.last[1], corner[1]), color: state.fill ?? state.pen };
  return paintArea(picture, area, (column) => column >= left && column <= right);
};

/**
 * @uses paintArea
 * @usedby drawItem
 */
const drawCircle = (picture, state, radius) => {
  // With a fill pen, the circle is full. Without it, the circle is a ring of the line width.
  const center = state.last;
  const area = { top: center[1] - radius - state.width, bottom: center[1] + radius + state.width, color: state.fill ?? state.pen };
  const inside = (column, row) => {
    const distance = Math.hypot(column - center[0], row - center[1]);
    return state.fill === null ? Math.abs(distance - radius) <= Math.max(state.width / 2, 0.5) : distance <= radius;
  };
  return paintArea(picture, area, inside);
};

/**
 * @usedby sweepRows
 */
const fillRow = (open, seeds) =>
  // In one row, each run of open pixels that touches a seed becomes filled.
  open.replace(/1+/g, (run, offset) => (seeds.slice(offset, offset + run.length).includes("1") ? run : "0".repeat(run.length)));

/**
 * @usedby sweepRows
 */
const mergeRows = (first, second) => [...first].map((mark, place) => (mark === "1" || second[place] === "1" ? "1" : "0")).join("");

/**
 * @uses fillRow, mergeRows
 * @usedby growFill
 */
const sweepRows = (open, filled) => {
  // Go down the rows. Each row takes seeds from itself and from the row above it.
  const addRow = (rows, row, place) => [...rows, fillRow(open[place], mergeRows(row, rows[place - 1] ?? row))];
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
  const start = picture.pixels[point[1] * width + point[0]];
  if (start === undefined || point[0] < 0 || point[0] >= width || start.join() === state.pen.join()) return picture;
  const rowOf = (make) => Array.from({ length: height }, (unused, row) => Array.from({ length: width }, (none, column) => make(column, row)).join(""));
  const open = rowOf((column, row) => (picture.pixels[row * width + column].join() === start.join() ? "1" : "0"));
  const seed = rowOf((column, row) => (column === point[0] && row === point[1] ? "1" : "0"));
  const filled = growFill(open, seed, SWEEP_LIMIT);
  return { ...picture, pixels: picture.pixels.map((pixel, place) => (filled[Math.floor(place / width)][place % width] === "1" ? state.pen : pixel)) };
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
 * @param {{ size: number[], pixels: number[][] }} picture - The size of the image and its pixels.
 * @param {Datum[]} commands - The values of the draw block.
 * @returns {{ size: number[], pixels: number[][] }}
 * @standard line - A line changes the pixels near each segment to the color of the pen.
 * @standard flood - A flood changes the joined pixels that have the color of the start pixel.
 * @uses drawItem, START
 * @usedby drawOnImage
 */
export const drawCommands = (picture, commands) => commands.reduce(drawItem, { picture, state: START }).picture;

/**
 * @uses readAll (src/store/store.mjs), drawCommands, readRest (src/store/store.mjs),
 *   giveValue (src/machine/machine.mjs), writeAll (src/store/store.mjs)
 * @usedby RASTER_NATIVES
 */
const drawOnImage = (machine, [image, commands]) => {
  // The image changes. The result is the image.
  const picture = { size: image.value.size, pixels: readAll(machine.store, image) };
  const drawn = drawCommands(picture, readRest(machine.store, commands));
  return giveValue({ ...machine, store: writeAll(machine.store, image, drawn.pixels) }, image);
};

/**
 * The natives that draw on an image. Each entry has the name of REBOL and the function.
 * @uses drawOnImage
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const RASTER_NATIVES = {
  draw: drawOnImage,
};
