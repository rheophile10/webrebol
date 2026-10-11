const NAMED_CODES = { null: 0, back: 8, tab: 9, line: 10, page: 12, esc: 27, del: 127 };
const SIGN_CODES = { "/": 10, "-": 9, "~": 127 };
const CODE_SIGNS = { 9: "^-", 10: "^/", 94: "^^", 127: "^~" };
const CONTROL_SHIFT = 64;

/**
 * @uses NAMED_CODES
 * @usedby replaceEscape
 */
const readNamedCode = (name) => NAMED_CODES[name.toLowerCase()] ?? parseInt(name, 16);

/**
 * @uses CONTROL_SHIFT
 * @usedby replaceEscape
 */
const readSignCode = (sign) => {
  // A letter from "@" to "_" gives a control character.
  const upper = sign.toUpperCase().charCodeAt(0);
  return upper >= CONTROL_SHIFT && upper < CONTROL_SHIFT + 32 ? upper - CONTROL_SHIFT : sign.charCodeAt(0);
};

/**
 * @uses SIGN_CODES, readSignCode, readNamedCode
 * @usedby unescapeText
 */
const replaceEscape = (escape, name, sign) =>
  String.fromCharCode(name === undefined ? (SIGN_CODES[sign] ?? readSignCode(sign)) : readNamedCode(name));

/**
 * @uses CODE_SIGNS, CONTROL_SHIFT
 * @usedby escapeControls, escapeInLines
 */
const escapeCharacter = (character) => {
  // A control character without a special sign gets the letter that is 64 after it.
  const code = character.charCodeAt(0);
  return CODE_SIGNS[code] ?? `^${String.fromCharCode(code + CONTROL_SHIFT)}`;
};

/**
 * @usedby hasBalance
 */
const countDepth = (depth, brace) => (depth < 0 ? depth : depth + (brace === "{" ? 1 : -1));

/**
 * @uses countDepth
 * @usedby escapeBraces
 */
const hasBalance = (text) => [...text.replace(/[^{}]/g, "")].reduce(countDepth, 0) === 0;

/**
 * Replaces each caret escape of a REBOL literal with its character.
 * @param {string} text - The characters between the delimiters of the literal.
 * @returns {string}
 * @uses replaceEscape
 * @usedby TOKEN_READERS
 */
export const unescapeText = (text) => text.replace(/\^\(([0-9A-Za-z]+)\)|\^([\s\S])/g, replaceEscape);

/**
 * Replaces each control character and each caret with its caret escape.
 * @param {string} text
 * @returns {string}
 * @uses escapeCharacter
 * @usedby moldString, moldChar
 */
export const escapeControls = (text) => text.replace(/[\x00-\x1F\x7F^]/g, escapeCharacter);

/**
 * Replaces each control character and each caret with its caret escape, but keeps the line ends.
 * @param {string} text
 * @returns {string}
 * @uses escapeCharacter
 * @usedby moldString
 */
export const escapeInLines = (text) => text.replace(/[\x00-\x09\x0B-\x1F\x7F^]/g, escapeCharacter);

/**
 * Puts a caret before each brace if the braces of the text do not balance.
 * @param {string} text
 * @returns {string}
 * @uses hasBalance
 * @usedby moldString
 */
export const escapeBraces = (text) => (hasBalance(text) ? text : text.replace(/[{}]/g, "^$&"));
