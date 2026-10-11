import { readEntry } from "../store/table.mjs";

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

/** The rows of pixels that each image canvas showed last. */
const shown = new WeakMap();

/**
 * @uses readEntry (src/store/table.mjs), shown
 * @usedby paintImages
 */
const paintImage = (store) => (canvas) => {
  // The store makes a new array only for a row that changed. Thus the painter draws only the rows that are new arrays.
  const rows = readEntry(store.series, Number(canvas.getAttribute("data-image")));
  const before = shown.get(canvas) ?? [];
  if (rows === undefined || rows === before) return;
  shown.set(canvas, rows);
  const context = canvas.getContext("2d");
  const paintRow = (row, line) => {
    if (row === before[line] || row.length === 0) return;
    // A pixel of the store has the bytes of the picture data of a canvas. Thus the numbers go to the canvas without a calculation.
    const bytes = Reflect.construct(Uint8ClampedArray, [Int32Array.from(row).buffer]);
    context.putImageData(Reflect.construct(ImageData, [bytes, row.length, 1]), 0, line);
  };
  rows.forEach(paintRow);
};

/**
 * Paints each image canvas of the page with the pixels of its image in the store.
 * @param {Element} root - The container of the view.
 * @param {object} store - The store of the session.
 * @returns {void}
 * @uses paintImage
 * @usedby frame
 */
export const paintImages = (root, store) => root.querySelectorAll("canvas[data-image]").forEach(paintImage(store));

/**
 * @usedby findCanvas
 */
const drawElement = (element) =>
  // Make a picture of an element: put its HTML into an SVG image, and draw that image on a canvas.
  Reflect.construct(Promise, [
    (resolve) => {
      const box = element.getBoundingClientRect();
      const copy = element.cloneNode(true);
      copy.setAttribute("style", `${copy.getAttribute("style") ?? ""};left:0px;top:0px`);
      const html = Reflect.construct(XMLSerializer, []).serializeToString(copy);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
      const picture = Reflect.construct(Image, []);
      picture.addEventListener("load", () => {
        const canvas = document.createElement("canvas");
        canvas.setAttribute("width", String(Math.round(box.width)));
        canvas.setAttribute("height", String(Math.round(box.height)));
        canvas.getContext("2d").drawImage(picture, 0, 0);
        resolve(canvas);
      });
      picture.setAttribute("src", `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    },
  ]);

/**
 * @uses drawElement
 * @usedby readFacePixels, downloadFace
 */
const findCanvas = (root, face) => {
  // A face with an image or a paint effect has a canvas with its pixels. Other faces need a picture of the element.
  const element = root.querySelector(`[data-face="${face}"]`);
  const canvas = element === null ? null : element.querySelector(":scope > canvas");
  return canvas === null && element !== null ? drawElement(element) : Promise.resolve(canvas);
};

/**
 * Reads the pixels of a face of the page, for the function to-image.
 * @param {Element} root - The container of the view.
 * @param {number} face - The context number of the face.
 * @returns {Promise<{ pixels: number[], size: number[] }>}
 * @uses findCanvas
 * @usedby serveRequest, servePaused
 */
export const readFacePixels = async (root, face) => {
  const canvas = await findCanvas(root, face);
  if (canvas === null) return { pixels: [], size: [0, 0] };
  const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  // The four bytes of each point become one number, as the store keeps a pixel.
  return { pixels: Array.from(Reflect.construct(Int32Array, [data.buffer])), size: [canvas.width, canvas.height] };
};

/**
 * Gives the picture of a face to the person as a PNG file.
 * @param {Element} root - The container of the view.
 * @param {{ face: number, name: string }} request
 * @returns {Promise<null>}
 * @uses findCanvas
 * @usedby serveRequest, servePaused
 */
export const downloadFace = async (root, request) => {
  const canvas = await findCanvas(root, request.face);
  if (canvas === null) return null;
  const link = document.createElement("a");
  link.setAttribute("href", canvas.toDataURL("image/png"));
  link.setAttribute("download", request.name);
  link.click();
  return null;
};
