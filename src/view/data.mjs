import { loadSource } from "../data/load.mjs";
import { LINES as FACTS } from "./viewdata.mjs";
import { LINES as FUNCTIONS } from "./viewspecs.mjs";

const FONT_LINE = /^font (\d+) (none|bold|italic|\[bold italic\]) (\d+) (.*)$/;

/**
 * @usedby readStyleLine
 */
const readStyle = (value) => {
  // A font style is none, a word, or a block of words. The key has the words in the sequence of REBOL.
  if (value === undefined || value.type === "none" || value.value === "none") return "";
  return Array.isArray(value.value) ? value.value.map((word) => word.value).join(" ") : String(value.value);
};

/**
 * @uses FONT_LINE
 * @usedby FONTS
 */
const readFont = (line) => {
  const [, size, style, height, widths] = line.match(FONT_LINE);
  return [`${size} ${style.replace(/[[\]]/g, "").replace("none", "")}`.trim(), { height: Number(height), widths: widths.split(" ").map(Number) }];
};

/**
 * @usedby readStyleLine
 */
const readBlock = (value) => (Array.isArray(value.value) ? value.value : null);

/**
 * @uses loadSource (src/data/load.mjs), readBlock, readStyle
 * @usedby STYLES
 */
const readStyleLine = (line) => {
  // The values of the line are the name, the size, the color, the font, the edge, the para and the text.
  const [, name, size, color, font, edge, para, text] = loadSource(line).value;
  const fontItems = readBlock(font);
  const facts = {
    size: size.type === "pair" ? size.value : null,
    color: color.type === "tuple" ? color.value : null,
    font: fontItems === null ? null : { size: fontItems[0].value, style: readStyle(fontItems[1]), items: fontItems },
    edge: readBlock(edge),
    para: readBlock(para),
    text: text.type === "string" ? text.value : null,
  };
  return [name.value.toLowerCase(), facts];
};

/**
 * @uses LINES
 * @usedby COLORS, FONTS, STYLES
 */
const pickLines = (kind) => FACTS.filter((line) => line.startsWith(`${kind} `));

/**
 * The color words of REBOL View. Each entry has the name and the three parts of the color.
 * @uses pickLines
 * @usedby GLOBALS (src/session/globals.mjs), readWordItem
 */
export const COLORS = Object.fromEntries(pickLines("color").map((line) => [line.split(" ")[1], line.split(" ")[2].split(".").map(Number)]));

/**
 * The height and the character widths of each font size and font style, as REBOL View measured them.
 * @uses pickLines, readFont
 * @usedby measureText
 */
export const FONTS = Object.fromEntries(pickLines("font").map(readFont));

/**
 * The default facets of each VID style.
 * @uses pickLines, readStyleLine
 * @usedby findSize, makeFace, placeFace, readWordItem
 */
export const STYLES = Object.fromEntries(pickLines("style").map(readStyleLine));

/**
 * The type and the parameters of each function that REBOL View adds to Core.
 * @uses LINES
 * @usedby makeFunction (src/session/globals.mjs)
 */
export const VIEW_SPECS = Object.fromEntries(
  FUNCTIONS.map((line) => {
    const [, name, type, spec] = line.match(/^(\S+) (\S+) ?(.*)$/);
    return [name, [type, spec]];
  }),
);

/**
 * Measures a text in a font, as `size-text` of REBOL View does for one line.
 * @param {string} text
 * @param {{ size: number, style: string } | null} font - The font, or null for the usual font.
 * @returns {number[]}
 * @standard overlap - The width is the sum of the character widths, less 1 for each character after the first (2 for a bold font).
 * @uses FONTS
 * @usedby findSize, sizeText
 */
export const measureText = (text, font) => {
  const facts = FONTS[`${font?.size ?? 12} ${font?.style ?? ""}`.trim()] ?? FONTS["12"];
  const sum = [...text].reduce((total, char) => total + (facts.widths[char.charCodeAt(0) - 1] ?? 0), 0);
  // REBOL measures one character with 1 pixel more than its advance. A bold character has 2 pixels more.
  const overlap = (font?.style ?? "").includes("bold") ? 2 : 1;
  return [Math.max(sum - overlap * Math.max(text.length - 1, 0), 0), facts.height];
};
