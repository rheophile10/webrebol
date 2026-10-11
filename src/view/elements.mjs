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
 * @usedby renderWindows
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
 * @uses makeElement, formPoints, testElement
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const WEB_NATIVES = {
  element: makeElement,
  "form-points": formPoints,
  "element?": testElement,
};

/**
 * The parameters of the web words, as REBOL text.
 */
export const WEB_SPECS = {
  element: ["native", "tag [word! string!] props [block! none!] children [block! none!]"],
  "element?": ["native", "value [any-type!]"],
  "form-points": ["native", "points [block!]"],
  "layout-faces": ["native", "specs [block!]"],
};
