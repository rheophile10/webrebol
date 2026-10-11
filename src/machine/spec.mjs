/** @import { Datum } from "../types/states.mjs" */
import { makeKey } from "../store/store.mjs";

const PARAMETER_KINDS = { word: "normal", "lit-word": "lit", "get-word": "get" };
const LISTS = ["block", "paren", "path", "set-path", "lit-path"];
const TEXTS = ["string", "file", "email", "url", "tag", "issue"];
/**
 * @uses LISTS, TEXTS
 * @usedby acceptsType
 */
/**
 * The types of each REBOL typeset, by the name of the typeset.
 * @uses LISTS, TEXTS
 * @usedby acceptsType, testTypeset (src/natives/compare.mjs), PREDICATES (src/natives/compare.mjs)
 */
export const TYPESETS = {
  "number!": ["integer", "decimal"],
  "series!": [...LISTS, ...TEXTS, "binary"],
  "any-block!": LISTS,
  "any-string!": [...TEXTS, "binary"],
  "any-word!": ["word", "set-word", "get-word", "lit-word", "refinement"],
  "any-function!": ["native", "action", "op", "function"],
  "scalar!": ["integer", "decimal", "char", "time", "pair", "tuple", "money", "date"],
  "any-path!": ["path", "set-path", "lit-path"],
  "any-object!": ["object", "error"],
};

/**
 * @uses makeKey (src/store/store.mjs), PARAMETER_KINDS
 * @usedby parseSpec
 */
const addEntry = (entries, item) => {
  // A block after a parameter gives the types that the parameter accepts.
  const last = entries[entries.length - 1];
  if (item.type === "block" && last !== undefined && last.kind !== "refinement") {
    return [...entries.slice(0, -1), { ...last, types: item.value }];
  }
  if (item.type === "refinement") return [...entries, { key: makeKey(item.value), kind: "refinement", name: item.value }];
  // Other items (texts, attributes) have no effect on a call.
  const kind = PARAMETER_KINDS[item.type];
  return kind === undefined ? entries : [...entries, { key: makeKey(item.value), kind, types: null, name: item.value }];
};

/**
 * @usedby parseSpec
 */
const groupEntry = (groups, entry) => {
  // A refinement starts a new group. A parameter goes into the last group.
  if (entry.kind === "refinement") return [...groups, { key: entry.key, params: [] }];
  const last = groups[groups.length - 1];
  return [...groups.slice(0, -1), { ...last, params: [...last.params, entry] }];
};

/**
 * Reads the parameters and the refinements of a function specification.
 * @param {{ type: string, value: string | string[] }[]} items - The items of the specification. A block holds the names of its types.
 * @returns {{ params: object[], refinements: object[], keys: string[] }}
 * @standard groups - The parameters after a refinement belong to that refinement.
 * @uses addEntry, groupEntry
 * @usedby makeFunction (src/natives/control.mjs), KEEP_SPEC (src/natives/items.mjs),
 *   makeFunction (src/session/globals.mjs)
 */
export const parseSpec = (items) => {
  // The first group has no refinement. It holds the usual parameters.
  const entries = items.reduce(addEntry, []);
  const groups = entries.reduce(groupEntry, [{ key: null, params: [] }]);
  return { params: groups[0].params, refinements: groups.slice(1), keys: entries.map((entry) => entry.key) };
};

/**
 * Finds if a parameter accepts a value.
 * @param {string[] | null} types - The type names of the parameter, or null for a parameter without types.
 * @param {Datum} value
 * @returns {boolean}
 * @standard unset - A parameter without types accepts all values but not the unset value.
 * @uses TYPESETS
 * @usedby invoke, matchesItem (src/natives/parse.mjs)
 */
export const acceptsType = (types, value) => {
  if (types === null) return value.type !== "unset";
  const accepts = (name) =>
    name === "any-type!" || name === `${value.type}!` || (TYPESETS[name] ?? []).includes(value.type);
  return types.some((name) => accepts(String(name).toLowerCase()));
};
