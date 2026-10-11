/** @import { Datum, Store } from "../types/states.mjs" */
import { isList, isText, makeRecord, makeSeries, readContext, readRest } from "../store/store.mjs";
import { formValue } from "../store/mold.mjs";
import { giveValue } from "../machine/machine.mjs";

const ELEMENT_WORDS = ["tag", "props", "children"];
const NO_UNIT = ["opacity", "z-index", "font-weight", "line-height", "flex", "flex-grow", "flex-shrink", "order", "zoom"];

/**
 * @uses makeRecord (src/store/store.mjs), ELEMENT_WORDS, giveValue (src/machine/machine.mjs)
 * @usedby WEB_NATIVES
 */
const makeElement = (machine, [tag, props, children]) => {
  // An element is an object with the tag, the block of the attributes, and the block of the children.
  const made = makeRecord(machine.store, ELEMENT_WORDS, [tag, props, children]);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses readRest (src/store/store.mjs)
 * @usedby writeStyle, exportElement
 */
const readPairs = (store, block) => {
  // A block of attributes has a name and then a value, for each attribute.
  const items = readRest(store, block);
  return Array.from({ length: Math.floor(items.length / 2) }, (unused, place) => [String(items[place * 2].value), items[place * 2 + 1]]);
};

/**
 * @uses NO_UNIT, formValue (src/store/mold.mjs)
 * @usedby writeStyle, writeProp
 */
const writeCssValue = (store, name, value) => {
  // A color is a tuple. A length is a number of pixels. Other values are text.
  if (value.type === "tuple") return `rgb(${value.value.slice(0, 3).join(",")})`;
  const isNumber = value.type === "integer" || value.type === "decimal";
  return isNumber && !NO_UNIT.includes(name) ? `${value.value}px` : formValue(store, value);
};

/**
 * @uses readPairs, writeCssValue
 * @usedby writeProp
 */
const writeStyle = (store, block) =>
  readPairs(store, block)
    .filter(([, value]) => value.type !== "none")
    .map(([name, value]) => `${name}:${writeCssValue(store, name, value)}`)
    .join(";");

/**
 * @uses isList (src/store/store.mjs), writeStyle, writeCssValue, formValue (src/store/mold.mjs)
 * @usedby exportElement
 */
const writeProp = (store, name, value) => {
  // The style attribute can be a block of CSS names and values. A logic value stays a logic value.
  if (name === "style" && isList(value)) return writeStyle(store, value);
  // A handler is a block. The page gets the number of its series. A face gives the number of its context.
  if (name.startsWith("data-on") && isList(value)) return String(value.value.id);
  if (value.type === "object") return String(value.value.context);
  // An image gives the number of its series. The page reads the pixels from the store.
  if (value.type === "image") return String(value.value.id);
  if (value.type === "logic") return value.value;
  return value.type === "tuple" ? writeCssValue(store, name, value) : formValue(store, value);
};

/**
 * @uses readContext (src/store/store.mjs)
 * @usedby exportElement, testElement
 */
const isElementObject = (store, value) => value.type === "object" && readContext(store, value.value.context).$tag !== undefined;

/**
 * Makes the element data of the page from a REBOL element. The data has the format of Plastron: a tag, the attributes and the children, or a text.
 * @param {Store} store
 * @param {Datum} value - An element object, or a value that becomes a text.
 * @returns {{ tag: string, props: object, children: object[], key?: string } | { text: string }}
 * @standard text - A value that is not an element gives a text node with the formed value.
 * @standard key - The attribute "key" becomes the key of the element, and it is not an attribute.
 * @standard style - A style block gives one CSS text. A number is a number of pixels, and a tuple is a color.
 * @uses isElementObject, formValue (src/store/mold.mjs), readContext (src/store/store.mjs),
 *   isList (src/store/store.mjs), readPairs, writeProp, readRest (src/store/store.mjs), isText (src/store/store.mjs)
 * @usedby formElement, renderWindows
 */
export const exportElement = (store, value) => {
  if (!isElementObject(store, value)) return { text: formValue(store, value) };
  const fields = readContext(store, value.value.context);
  const pairs = isList(fields.$props) ? readPairs(store, fields.$props).filter(([, item]) => item.type !== "none") : [];
  const props = Object.fromEntries(pairs.filter(([name]) => name !== "key").map(([name, item]) => [name, writeProp(store, name, item)]));
  const key = pairs.find(([name]) => name === "key");
  const children = isList(fields.$children) ? readRest(store, fields.$children).map((child) => exportElement(store, child)) : [];
  const tag = isText(fields.$tag) ? readRest(store, fields.$tag) : String(fields.$tag.value);
  return key === undefined ? { tag, props, children } : { tag, props, children, key: formValue(store, key[1]) };
};

/**
 * @uses giveValue (src/machine/machine.mjs), isElementObject
 * @usedby WEB_NATIVES
 */
const testElement = (machine, [value]) =>
  giveValue(machine, { type: "logic", value: isElementObject(machine.store, value) });

/**
 * The web words: the natives that make elements as data. These words are not in REBOL 2.
 */
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/**
 * @uses ESCAPES
 * @usedby writeMarkup
 */
const escapeMarkup = (text) => String(text).replace(/[&<>"]/g, (sign) => ESCAPES[sign]);

/**
 * Makes the HTML or SVG text of element data.
 * @param {{ tag?: string, props?: object, children?: object[], text?: string }} node - Element data in the format of Plastron.
 * @param {boolean} [top] - The node is the top of the text. Only the top svg element gets the attribute xmlns.
 * @returns {string}
 * @standard escape - The special characters of a text and of an attribute value are written as entities.
 * @standard namespace - An svg element at the top gets the attribute xmlns, thus the text is a correct SVG file.
 * @uses escapeMarkup
 * @usedby formElement
 */
export const writeMarkup = (node, top = true) => {
  if (node.tag === undefined) return escapeMarkup(node.text);
  const named = top && node.tag === "svg" && node.props.xmlns === undefined;
  const props = named ? { xmlns: "http://www.w3.org/2000/svg", ...node.props } : node.props;
  const attributes = Object.entries(props)
    .filter(([, value]) => value !== false)
    .map(([name, value]) => ` ${name}="${escapeMarkup(value === true ? "" : value)}"`);
  const inner = node.children.map((child) => writeMarkup(child, false));
  return node.children.length === 0 ? `<${node.tag}${attributes.join("")}/>` : `<${node.tag}${attributes.join("")}>${inner.join("")}</${node.tag}>`;
};

/**
 * @uses makeSeries (src/store/store.mjs), writeMarkup, exportElement, giveValue (src/machine/machine.mjs)
 * @usedby WEB_NATIVES
 */
const formElement = (machine, [value]) => {
  // The result is the text of the element, for example the text of an SVG file.
  const made = makeSeries(machine.store, "string", writeMarkup(exportElement(machine.store, value)));
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses readRest (src/store/store.mjs), makeSeries (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby WEB_NATIVES
 */
const formPoints = (machine, [points]) => {
  // The points of an SVG shape: "x,y x,y". A native does this, because a drawing can have many points.
  const text = readRest(machine.store, points).map((point) => point.value.join(",")).join(" ");
  const made = makeSeries(machine.store, "string", text);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses makeElement, formPoints, formElement, testElement
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const WEB_NATIVES = {
  element: makeElement,
  "form-points": formPoints,
  "form-element": formElement,
  "element?": testElement,
};

/**
 * The parameters of the web words, as REBOL text.
 */
export const WEB_SPECS = {
  element: ["native", "tag [word! string!] props [block! none!] children [block! none!]"],
  "element?": ["native", "value [any-type!]"],
  "form-points": ["native", "points [block!]"],
  "form-element": ["native", "value [object! string!]"],
  "layout-faces": ["native", "specs [block!]"],
  "download-image": ["native", "face [object!] name [string! file!]"],
};
