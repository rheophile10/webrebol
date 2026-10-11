// The painter of a paint canvas. A canvas with the attribute data-paint has a list of draw commands as text.
// The canvas keeps its pixels, thus the painter draws only the commands that are new since the last frame.

/** The state of each paint canvas: the number of commands that are drawn, the pen, the width and the last point. */
const states = new WeakMap();

const START = { count: 0, pen: "rgb(0,0,0)", width: 1, mode: null, last: null, first: null };

/**
 * @usedby SETTERS
 */
const readColor = (token) => `rgb(${token.split(".").slice(0, 3).join(",")})`;

/**
 * @usedby stepToken
 */
const readPoint = (token) => token.split("x").map(Number);

/**
 * @usedby stepToken
 */
const isPoint = (token) => /^-?\d+x-?\d+$/.test(token);

/**
 * @usedby stepToken
 */
const drawSegment = (context, state, point) => {
  // A line goes from the last point to the new point, with round ends.
  Reflect.set(context, "strokeStyle", state.pen);
  Reflect.set(context, "lineWidth", state.width);
  Reflect.set(context, "lineCap", "round");
  context.beginPath();
  context.moveTo(...(state.last ?? point));
  context.lineTo(...point);
  context.stroke();
};

/**
 * @usedby stepToken
 */
const drawBox = (context, state, point) => {
  Reflect.set(context, "fillStyle", state.pen);
  context.fillRect(state.first[0], state.first[1], point[0] - state.first[0], point[1] - state.first[1]);
};

/**
 * @uses readColor
 * @usedby stepToken
 */
const SETTERS = {
  pen: (state, token) => ({ ...state, pen: readColor(token), mode: null }),
  "line-width": (state, token) => ({ ...state, width: Number(token), mode: null }),
};

/**
 * @uses SETTERS, isPoint, readPoint, drawSegment, drawBox
 * @usedby paintCanvas
 */
const stepToken = (context) => (state, token) => {
  // A word starts a command. A value after `pen` or `line-width` sets it. A point after `line` or `box` draws.
  if (state.mode !== null && SETTERS[state.mode] !== undefined) return SETTERS[state.mode](state, token);
  if (!isPoint(token)) return { ...state, mode: token, last: null, first: null };
  const point = readPoint(token);
  if (state.mode === "line") drawSegment(context, state, point);
  if (state.mode === "box" && state.first !== null) drawBox(context, state, point);
  return { ...state, last: point, first: state.first ?? point };
};

/**
 * @uses states, START, stepToken
 * @usedby paintCanvases
 */
const paintCanvas = (canvas) => {
  // A shorter list of commands means that the script cleared the picture. Then draw all the commands again.
  const tokens = canvas.getAttribute("data-paint").split(" ").filter((token) => token !== "");
  const kept = states.get(canvas) ?? START;
  const context = canvas.getContext("2d");
  if (tokens.length < kept.count) context.clearRect(0, 0, canvas.width, canvas.height);
  const from = tokens.length < kept.count ? START : kept;
  states.set(canvas, { ...tokens.slice(from.count).reduce(stepToken(context), from), count: tokens.length });
};

/**
 * Paints the new commands of each paint canvas of the page.
 * @param {Element} root - The container of the view.
 * @returns {void}
 * @uses paintCanvas
 * @usedby frame
 */
export const paintCanvases = (root) => root.querySelectorAll("canvas[data-paint]").forEach(paintCanvas);
