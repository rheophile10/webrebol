// The DOM side of the page: it makes DOM nodes from element data and applies patches.
// This code is a copy of the DOM code of Plastron3 (src/page/dom.edge.mjs), by the same author.

/**
 * Sets one attribute. A false or empty value removes it. A true value gives an empty attribute.
 * The value of an input or a select is also its live value, because the attribute does not change it after an edit or a choice.
 * @usedby createNode, setProps
 */
const setAttribute = (node, name, value) => {
  if (name === "value" && "value" in node && node.value !== String(value ?? "")) Reflect.set(node, "value", String(value ?? ""));
  if (value === null || value === undefined || value === false) return node.removeAttribute(name);
  return node.setAttribute(name, value === true ? "" : String(value));
};

const SVG = "http://www.w3.org/2000/svg";

/**
 * Decides if the children of a node are SVG. A foreignObject holds HTML again.
 * @uses SVG
 * @usedby insertNode, APPLY
 */
const insideSvg = (node) => node !== null && node !== undefined && node.namespaceURI === SVG && node.localName !== "foreignObject";

/**
 * Makes a DOM node from a view. An svg element and everything inside it get the SVG namespace.
 * @param {object} vnode
 * @param {boolean} [svg] - The node is inside an svg element.
 * @returns {Node}
 * @uses SVG, setAttribute
 * @usedby insertNode, APPLY
 */
export const createNode = (vnode, svg = false) => {
  if ("text" in vnode) return document.createTextNode(vnode.text);
  const inSvg = svg || vnode.tag === "svg";
  const node = inSvg ? document.createElementNS(SVG, vnode.tag) : document.createElement(vnode.tag);
  Object.entries(vnode.props).forEach(([name, value]) => setAttribute(node, name, value));
  vnode.children.forEach((child) => node.appendChild(createNode(child, inSvg && vnode.tag !== "foreignObject")));
  return node;
};

/**
 * @usedby insertNode, setProps, APPLY
 */
const nodeAt = (root, path) => path.reduce((node, index) => node.childNodes[index], root);

/**
 * @uses nodeAt, createNode, insideSvg
 * @usedby APPLY
 */
const insertNode = (root, patch) => {
  const parent = nodeAt(root, patch.path.slice(0, -1));
  parent.insertBefore(createNode(patch.vnode, insideSvg(parent)), parent.childNodes[patch.path[patch.path.length - 1]] ?? null);
};

/**
 * @uses nodeAt, setAttribute
 * @usedby APPLY
 */
const setProps = (root, patch) => {
  const node = nodeAt(root, patch.path);
  Object.entries(patch.set).forEach(([name, value]) => setAttribute(node, name, value));
  patch.remove.forEach((name) => node.removeAttribute(name));
};

/**
 * The operation of each kind of patch.
 * @uses insertNode, nodeAt, createNode, insideSvg, setProps
 * @usedby applyPatches
 */
const APPLY = {
  insert: insertNode,
  remove: (root, patch) => nodeAt(root, patch.path).remove(),
  replace: (root, patch) => {
    const node = nodeAt(root, patch.path);
    node.replaceWith(createNode(patch.vnode, insideSvg(node.parentNode)));
  },
  text: (root, patch) => {
    const node = nodeAt(root, patch.path);
    node.replaceData(0, node.length, patch.text);
  },
  props: setProps,
  move: (root, patch) => {
    const parent = nodeAt(root, patch.path);
    parent.insertBefore(parent.childNodes[patch.from], patch.before === null ? null : parent.childNodes[patch.before]);
  },
};

/**
 * Applies the patches of a diff to the page, in their sequence.
 * @param {Element} root - The container of the view.
 * @param {object[]} patches
 * @returns {void}
 * @uses APPLY
 * @usedby paint
 */
export const applyPatches = (root, patches) => patches.forEach((patch) => APPLY[patch.kind](root, patch));
