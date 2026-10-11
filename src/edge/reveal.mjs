// The painter of the reveal animations. A canvas with the attribute data-reveal has a time for each cell of a grid.
// On each animation frame, the painter draws the cover, cuts the cells whose time is over, and puts lights on the front.
// This is the method of the player of the animations project (stegosaurus/animations), by the same author.
import { findThreshold } from "../view/grid.mjs";

const PARTS = 5;

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
 * @uses readNumbers, readLights
 * @usedby paintCanvas
 */
const readScene = (canvas) => {
  const [columns, rows] = canvas.getAttribute("data-grid").split("x").map(Number);
  return {
    columns,
    rows,
    times: readNumbers(canvas.getAttribute("data-reveal")),
    lights: readLights(canvas.getAttribute("data-lights") ?? ""),
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
  if (age >= 0) context.clearRect(column * size.width, row * size.height, size.width + 0.5, size.height + 0.5);
  const light = scene.lights.find((item) => age >= item.from && age < item.until);
  if (light === undefined || progress >= 1) return;
  const level = light.first + ((light.last - light.first) * (age - light.from)) / (light.until - light.from);
  if (findThreshold(column, row) >= level) return;
  Reflect.set(context, "fillStyle", light.color);
  context.fillRect(column * size.width, row * size.height, size.width + 0.5, size.height + 0.5);
};

/**
 * @uses readScene, paintCell, findProgress
 * @usedby paintReveals
 */
const paintCanvas = (now) => (canvas) => {
  const scene = readScene(canvas);
  const context = canvas.getContext("2d");
  Reflect.set(context, "fillStyle", scene.cover);
  context.fillRect(0, 0, canvas.width, canvas.height);
  scene.times.forEach(paintCell(context, scene, findProgress(canvas, now)));
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
