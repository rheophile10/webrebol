// The painter of the reveal animations. A canvas with the attribute data-reveal has a time for each cell of a grid.
// On each animation frame, the painter draws the cover, cuts the cells whose time is over, and puts lights on the front.
// A reveal can also have letters: each cell shows a letter of a message for a part of its time.
// This is the method of the player of the animations project (stegosaurus/animations), by the same author.
import { findThreshold } from "../view/grid.mjs";

const PARTS = 5;
const GLYPH_PARTS = 10;
const GLYPH_FONT = "ui-monospace, Menlo, Consolas, monospace";

/** The start time of each run of each canvas, by the canvas element. */
const starts = new WeakMap();

/**
 * @usedby readScene
 */
const readNumbers = (text) => text.split(" ").map(Number);

/**
 * @uses PARTS
 * @usedby readScene
 */
const readLights = (text) => {
  // A light has a start age, an end age, a color, a start level and an end level.
  const items = text.trim() === "" ? [] : text.split(" ");
  return Array.from({ length: Math.floor(items.length / PARTS) }, (unused, place) => {
    const [from, until, color, first, last] = items.slice(place * PARTS, (place + 1) * PARTS);
    return { from: Number(from), until: Number(until), color: `rgb(${color.split(".").join(",")})`, first: Number(first), last: Number(last) };
  });
};

/**
 * @uses GLYPH_PARTS
 * @usedby readScene
 */
const readGlyphs = (text) => {
  // A glyph rule has a start age, an end age, a color, two alpha values, two sizes, a stride, a rate and a mode.
  const items = text.trim() === "" ? [] : text.trim().split(" ");
  return Array.from({ length: Math.floor(items.length / GLYPH_PARTS) }, (unused, place) => {
    const [from, until, color, ...rest] = items.slice(place * GLYPH_PARTS, (place + 1) * GLYPH_PARTS);
    const [alphaFirst, alphaLast, sizeFirst, sizeLast, stride, rate] = rest.map(Number);
    return { from: Number(from), until: Number(until), color: color.split(".").join(","), alphaFirst, alphaLast, sizeFirst, sizeLast, stride, rate, cut: rest[6] === "cut" };
  });
};

/**
 * @uses readNumbers, readLights, readGlyphs
 * @usedby paintCanvas
 */
const readScene = (canvas) => {
  const [columns, rows] = canvas.getAttribute("data-grid").split("x").map(Number);
  return {
    columns,
    rows,
    times: readNumbers(canvas.getAttribute("data-reveal")),
    lights: readLights(canvas.getAttribute("data-lights") ?? ""),
    glyphs: readGlyphs(canvas.getAttribute("data-glyphs") ?? ""),
    letters: Array.from(canvas.getAttribute("data-letters") ?? ""),
    hole: Number(canvas.getAttribute("data-hole") ?? 0),
    cover: canvas.getAttribute("data-cover"),
    duration: Number(canvas.getAttribute("data-duration")),
  };
};

/**
 * @uses starts
 * @usedby paintCanvas
 */
const findProgress = (canvas, now) => {
  // A new run number starts the animation again.
  const run = canvas.getAttribute("data-run");
  const last = starts.get(canvas);
  const start = last === undefined || last.run !== run ? { run, time: now } : last;
  starts.set(canvas, start);
  return Math.min(1, (now - start.time) / Number(canvas.getAttribute("data-duration")));
};

/**
 * @uses findThreshold (src/view/grid.mjs)
 * @usedby paintCanvas
 */
const paintCell = (context, scene, progress) => (time, index) => {
  // A cell whose time is over is a hole. A cell near the front can have a light.
  const size = { width: context.canvas.width / scene.columns, height: context.canvas.height / scene.rows };
  const [column, row] = [index % scene.columns, Math.floor(index / scene.columns)];
  const age = progress - time;
  if (age >= scene.hole) context.clearRect(column * size.width, row * size.height, size.width + 0.5, size.height + 0.5);
  const light = scene.lights.find((item) => age >= item.from && age < item.until);
  if (light === undefined || progress >= 1) return;
  const level = light.first + ((light.last - light.first) * (age - light.from)) / (light.until - light.from);
  if (findThreshold(column, row) >= level) return;
  Reflect.set(context, "fillStyle", light.color);
  context.fillRect(column * size.width, row * size.height, size.width + 0.5, size.height + 0.5);
};

/**
 * @uses GLYPH_FONT
 * @usedby paintCanvas
 */
const paintGlyph = (context, scene, progress) => (time, index) => {
  // A cell shows a letter while its age is in a glyph rule. The letter can change, fade and grow with the age.
  const age = progress - time;
  const rule = scene.glyphs.find((item) => age >= item.from && age < item.until);
  if (rule === undefined || progress >= 1 || scene.letters.length === 0) return;
  const part = (age - rule.from) / (rule.until - rule.from);
  const side = context.canvas.height / scene.rows;
  const letter = scene.letters[(index * rule.stride + Math.floor(age * rule.rate)) % scene.letters.length];
  // A rule with the mode "cut" removes the shape of the letter from the cover.
  Reflect.set(context, "globalCompositeOperation", rule.cut ? "destination-out" : "source-over");
  Reflect.set(context, "font", `700 ${Math.round(side * (rule.sizeFirst + (rule.sizeLast - rule.sizeFirst) * part))}px ${GLYPH_FONT}`);
  Reflect.set(context, "fillStyle", `rgba(${rule.color},${(rule.alphaFirst + (rule.alphaLast - rule.alphaFirst) * part).toFixed(2)})`);
  const [column, row] = [index % scene.columns, Math.floor(index / scene.columns)];
  context.fillText(letter, (column + 0.5) * (context.canvas.width / scene.columns), (row + 0.5) * side);
};

/**
 * @uses readScene, findProgress, paintCell, paintGlyph
 * @usedby paintReveals
 */
const paintCanvas = (now) => (canvas) => {
  const scene = readScene(canvas);
  const context = canvas.getContext("2d");
  const progress = findProgress(canvas, now);
  Reflect.set(context, "globalCompositeOperation", "source-over");
  Reflect.set(context, "fillStyle", scene.cover);
  context.fillRect(0, 0, canvas.width, canvas.height);
  scene.times.forEach(paintCell(context, scene, progress));
  // The letters come after all the cells, because a large letter goes into the cells adjacent to it.
  Reflect.set(context, "textAlign", "center");
  Reflect.set(context, "textBaseline", "middle");
  scene.times.forEach(paintGlyph(context, scene, progress));
};

/**
 * Paints each reveal canvas of the page for the current time.
 * @param {Element} root - The container of the view.
 * @param {number} now - The time of the animation frame, in milliseconds.
 * @returns {void}
 * @uses paintCanvas
 * @usedby frame
 */
export const paintReveals = (root, now) => root.querySelectorAll("canvas[data-reveal]").forEach(paintCanvas(now));
