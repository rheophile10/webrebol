import { makeDatum } from "../data/datum.mjs";
import { NONE, isText, makeSeries, readAll, readRest, readWord, writeWord } from "../store/store.mjs";
import { formValue } from "../store/mold.mjs";
import { giveValue, makeLogic, makeMachine, makeWord } from "../machine/machine.mjs";
import { runMachine } from "../machine/run.mjs";
import { acceptsType } from "../machine/spec.mjs";
import { areEqual } from "./compare.mjs";
import { hasBit } from "./bitsets.mjs";

const BATCH = Array.from({ length: 64 });
const PAREN_BUDGET = 100000;
const WORDS = ["word", "set-word", "get-word", "lit-word", "refinement"];

/**
 * @usedby matchScan
 */
const countUp = (size) => Array.from({ length: Math.max(size, 0) });

/**
 * @usedby 11 declarations in parse
 */
const failState = (state) => ({ ...state, ok: false });

/**
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby matchSet, matchScan, matchInner, MATCHERS
 */
const throwState = (state, text, args) => ({
  ...state,
  ok: false,
  thrown: { kind: "error", value: { ...makeDatum("error", text), args } },
});

/**
 * @uses readAll (src/store/store.mjs)
 * @usedby 9 declarations in parse
 */
const readInput = (rules, state) => readAll(state.store, rules.input);

/**
 * @uses readInput
 * @usedby matchText, matchSkip, matchEnd
 */
const skipSpaces = (rules, state) => {
  // Without /all, the spaces before a text of the rule are not important.
  if (!rules.text || rules.all) return state;
  const rest = readInput(rules, state).slice(state.pos);
  return { ...state, pos: state.pos + rest.length - rest.trimStart().length };
};

/**
 * @uses skipSpaces, readInput, failState
 * @usedby matchInText
 */
const matchText = (rules, state, wanted) => {
  const ready = skipSpaces(rules, state);
  const part = readInput(rules, ready).slice(ready.pos, ready.pos + wanted.length);
  const same = rules.exact ? part === wanted : part.toLowerCase() === wanted.toLowerCase();
  return same ? { ...ready, pos: ready.pos + wanted.length } : failState(state);
};

/**
 * @uses matchText, formValue (src/store/mold.mjs), readInput, hasBit, failState
 * @usedby matchValue
 */
const matchInText = (rules, state, value) => {
  // A bitset matches one character. Other values match their formed text.
  if (value.type !== "bitset") return matchText(rules, state, value.type === "tag" ? `<${formValue(state.store, value).slice(1, -1)}>` : formValue(state.store, value));
  const input = readInput(rules, state);
  const found = state.pos < input.length && hasBit(value, input.charCodeAt(state.pos));
  return found ? { ...state, pos: state.pos + 1 } : failState(state);
};

/**
 * @uses acceptsType (src/machine/spec.mjs), areEqual
 * @usedby matchInList
 */
const matchesItem = (store, item, value) => {
  // A datatype matches an item of that type. A lit-word matches the same word. Other values match an equal item.
  if (value.type === "datatype") return acceptsType([`${value.value}!`], item);
  if (value.type === "lit-word") return item.type === "word" && item.value.toLowerCase() === value.value.toLowerCase();
  return areEqual(store, item, value);
};

/**
 * @uses readInput, matchesItem, failState
 * @usedby matchValue
 */
const matchInList = (rules, state, value) => {
  const item = readInput(rules, state)[state.pos];
  return item !== undefined && matchesItem(state.store, item, value) ? { ...state, pos: state.pos + 1 } : failState(state);
};

/**
 * @uses matchInText, matchInList
 * @usedby MATCHERS
 */
const matchValue = (rules, state, term) => (rules.text ? matchInText : matchInList)(rules, state, term.value);

/**
 * @uses matchTerm
 * @usedby loopTerm
 */
const stepLoop = (rules, term) => (loop) => {
  // The loop stops when the rule does not match, when the count is at its maximum, or when the position does not move.
  if (!loop.open || loop.count >= term.max) return { ...loop, open: false };
  const next = matchTerm(rules, loop.state, term.inner);
  if (!next.ok) return { ...loop, state: { ...loop.state, store: next.store, thrown: next.thrown }, open: false };
  // A loop without a maximum stops when the position does not move. A loop with a count does all of its count.
  const moved = next.pos !== loop.state.pos;
  const counted = Number.isFinite(term.max);
  return { state: next, count: moved || counted ? loop.count + 1 : Math.max(loop.count + 1, term.min), open: moved || counted };
};

/**
 * @uses BATCH, stepLoop
 * @usedby matchRepeat
 */
const loopTerm = (rules, loop, term) => {
  const after = BATCH.reduce(stepLoop(rules, term), loop);
  return after.open ? loopTerm(rules, after, term) : after;
};

/**
 * @uses loopTerm, failState
 * @usedby MATCHERS
 */
const matchRepeat = (rules, state, term) => {
  const looped = loopTerm(rules, { state, count: 0, open: true }, term);
  if (looped.state.thrown !== undefined) return failState(looped.state);
  return looped.count >= term.min ? looped.state : failState({ ...state, store: looped.state.store });
};

/**
 * @uses matchTerm, readInput, writeWord (src/store/store.mjs), NONE (src/store/store.mjs),
 *   makeSeries (src/store/store.mjs)
 * @usedby MATCHERS
 */
const matchCopy = (rules, state, term) => {
  // The word gets a copy of the matched part. An empty part gives none.
  const next = matchTerm(rules, state, term.inner);
  if (!next.ok) return next;
  const part = readInput(rules, next).slice(state.pos, next.pos);
  if (part.length === 0) return { ...next, store: writeWord(next.store, term.word, NONE) };
  const made = makeSeries(next.store, rules.input.type, part);
  return { ...next, store: writeWord(made.store, term.word, made.value) };
};

/**
 * @uses throwState, makeWord (src/machine/machine.mjs), matchTerm, readInput, NONE (src/store/store.mjs),
 *   writeWord (src/store/store.mjs)
 * @usedby MATCHERS
 */
const matchSet = (rules, state, term) => {
  // REBOL 2 does not permit `set` for a text.
  if (rules.text) return throwState(state, "script invalid-arg", [makeWord("set")]);
  const next = matchTerm(rules, state, term.inner);
  if (!next.ok) return next;
  const item = next.pos > state.pos ? readInput(rules, next)[state.pos] : NONE;
  return { ...next, store: writeWord(next.store, term.word, item) };
};

/**
 * @uses throwState, countUp, readInput, matchTerm, failState
 * @usedby MATCHERS
 */
const matchScan = (rules, state, term) => {
  // REBOL 2 does not permit a bitset after `to` or `thru`.
  if (term.inner.kind === "value" && term.inner.value.type === "bitset") {
    return throwState(state, "script invalid-arg", [term.inner.value]);
  }
  // Find the first position where the rule matches. In a scan, spaces are as important as other characters.
  const exact = { ...rules, all: true };
  const places = countUp(readInput(rules, state).length - state.pos + 1).map((item, offset) => state.pos + offset);
  const place = places.find((start) => matchTerm(exact, { ...state, pos: start }, term.inner).ok);
  if (place === undefined) return failState(state);
  return term.thru ? matchTerm(exact, { ...state, pos: place }, term.inner) : { ...state, pos: place };
};

/**
 * @uses readInput, failState, matchTerm, readAll (src/store/store.mjs)
 * @usedby MATCHERS
 */
const matchInto = (rules, state, term) => {
  // The item at the position must be a block that the rule matches to its end.
  const item = readInput(rules, state)[state.pos];
  if (rules.text || item === undefined || item.type !== "block") return failState(state);
  const inner = { ...rules, input: item };
  const next = matchTerm(inner, { ...state, pos: item.value.index }, term.inner);
  const complete = next.ok && next.pos >= readAll(next.store, item).length;
  return complete ? { ...next, pos: state.pos + 1 } : failState({ ...state, store: next.store, thrown: next.thrown });
};

/**
 * @uses writeWord (src/store/store.mjs)
 * @usedby MATCHERS
 */
const matchMark = (rules, state, term) => {
  // The position in a text has the type of the text. The position in a list is always a block, as in REBOL.
  const position = { ...rules.input, type: rules.text ? rules.input.type : "block", value: { ...rules.input.value, index: state.pos } };
  return { ...state, store: writeWord(state.store, term.word, position) };
};

/**
 * @uses readWord (src/store/store.mjs), failState
 * @usedby MATCHERS
 */
const matchJump = (rules, state, term) => {
  const position = readWord(state.store, term.word);
  return typeof position.value?.index === "number" ? { ...state, pos: position.value.index } : failState(state);
};

/**
 * @uses runMachine (src/machine/run.mjs), makeMachine (src/machine/machine.mjs), PAREN_BUDGET
 * @usedby MATCHERS
 */
const matchParen = (rules, state, term) => {
  // The code of a paren runs in a machine of its own. An error in the code stops the parse.
  const done = runMachine(makeMachine(state.store, term.paren), PAREN_BUDGET);
  return done.thrown === null ? { ...state, store: done.store } : { ...state, store: done.store, ok: false, thrown: done.thrown };
};

/**
 * @uses readInput
 * @usedby matchSkip, matchEnd, MATCHERS
 */
const sizeOf = (rules, state) => readInput(rules, state).length;

/**
 * @uses skipSpaces, sizeOf, failState
 * @usedby MATCHERS
 */
const matchSkip = (rules, state) => {
  const ready = skipSpaces(rules, state);
  return ready.pos < sizeOf(rules, ready) ? { ...ready, pos: ready.pos + 1 } : failState(state);
};

/**
 * @uses skipSpaces, sizeOf, failState
 * @usedby MATCHERS
 */
const matchEnd = (rules, state) => {
  // The spaces before the end are not important for the command `end`. They are important at the end of the rule block.
  const ready = skipSpaces(rules, state);
  return ready.pos >= sizeOf(rules, ready) ? ready : failState(state);
};

const RULE_DEPTH = 400;

/**
 * @uses RULE_DEPTH, throwState, matchBlock
 * @usedby MATCHERS
 */
const matchInner = (rules, state, term) => {
  // A rule that names itself without an end is an error, as in REBOL.
  const depth = (rules.depth ?? 0) + 1;
  if (depth > RULE_DEPTH) return throwState(state, "internal stack-overflow", []);
  return matchBlock({ ...rules, depth }, state, term.block);
};

/**
 * @uses matchValue, matchInner, matchSkip, matchEnd, matchRepeat, matchCopy, matchSet, matchScan, sizeOf, failState,
 *   matchInto, matchMark, matchJump, matchParen, throwState
 * @usedby matchTerm
 */
const MATCHERS = {
  value: matchValue,
  block: matchInner,
  skip: matchSkip,
  end: matchEnd,
  none: (rules, state) => state,
  repeat: matchRepeat,
  copy: matchCopy,
  set: matchSet,
  scan: matchScan,
  place: (rules, state, term) => (term.index >= 0 && term.index <= sizeOf(rules, state) ? { ...state, pos: term.index } : failState(state)),
  into: matchInto,
  mark: matchMark,
  jump: matchJump,
  paren: matchParen,
  error: (rules, state, term) => throwState(state, term.text, term.args),
};

/**
 * @uses MATCHERS
 * @usedby stepLoop, matchCopy, matchSet, matchScan, matchInto, matchSequence
 */
const matchTerm = (rules, state, term) => MATCHERS[term.kind](rules, state, term);

/**
 * @uses takeInner
 * @usedby KEYWORDS
 */
const takeScan = (thru) => (store, rest) => {
  // A number after `to` or `thru` is a position in the input, counted from 1.
  if (rest[0]?.type === "integer") return { term: { kind: "place", index: rest[0].value - (thru ? 0 : 1) }, rest: rest.slice(1) };
  return takeInner((inner) => ({ kind: "scan", thru, inner }))(store, rest);
};

/**
 * @uses takeTerm
 * @usedby takeScan, KEYWORDS
 */
const takeInner = (make) => (store, rest) => {
  // The command uses the next term of the rule block.
  const inner = takeTerm(store, rest);
  return { term: make(inner.term), rest: inner.rest };
};

/**
 * @uses takeTerm
 * @usedby KEYWORDS
 */
const takeWithWord = (kind) => (store, rest) => {
  // A position word between the word and the rule gets the position before the rule.
  if (rest[1]?.type === "set-word") return { term: { kind: "mark", word: rest[1] }, rest: [{ type: "word", value: kind, bind: 0 }, rest[0], ...rest.slice(2)] };
  const inner = takeTerm(store, rest.slice(1));
  return { term: { kind, word: rest[0], inner: inner.term }, rest: inner.rest };
};

/**
 * @usedby KEYWORDS
 */
const takeSimple = (kind) => (store, rest) => ({ term: { kind }, rest });

/**
 * @uses takeSimple, takeInner, takeScan, takeWithWord
 * @usedby takeWord
 */
const KEYWORDS = {
  skip: takeSimple("skip"),
  end: takeSimple("end"),
  none: takeSimple("none"),
  some: takeInner((inner) => ({ kind: "repeat", min: 1, max: Infinity, inner })),
  any: takeInner((inner) => ({ kind: "repeat", min: 0, max: Infinity, inner })),
  opt: takeInner((inner) => ({ kind: "repeat", min: 0, max: 1, inner })),
  "to": (store, rest) => takeScan(false)(store, rest),
  thru: (store, rest) => takeScan(true)(store, rest),
  into: takeInner((inner) => ({ kind: "into", inner })),
  copy: takeWithWord("copy"),
  set: takeWithWord("set"),
};

/**
 * @uses takeTerm
 * @usedby TAKERS
 */
const takeCount = (store, items) => {
  // One integer gives an exact count. Two integers give a minimum and a maximum.
  const second = items[1]?.type === "integer" ? items[1].value : null;
  const inner = takeTerm(store, items.slice(second === null ? 1 : 2));
  const term = { kind: "repeat", min: items[0].value, max: second ?? items[0].value, inner: inner.term };
  return { term, rest: inner.rest };
};

/**
 * @uses KEYWORDS, readWord (src/store/store.mjs), WORDS, takeTerm
 * @usedby TAKERS
 */
const takeWord = (store, items) => {
  // A word that is not a command gives its value as the rule.
  const keyword = KEYWORDS[items[0].value.toLowerCase()];
  if (keyword !== undefined) return keyword(store, items.slice(1));
  const value = readWord(store, items[0]);
  if (value.type === "unset") {
    return { term: { kind: "error", text: "script no-value", args: [items[0]] }, rest: items.slice(1) };
  }
  if (WORDS.includes(value.type)) return { term: { kind: "value", value }, rest: items.slice(1) };
  return takeTerm(store, [value, ...items.slice(1)]);
};

/**
 * @uses takeCount, takeWord
 * @usedby takeTerm
 */
const TAKERS = {
  integer: takeCount,
  word: takeWord,
  "set-word": (store, items) => ({ term: { kind: "mark", word: items[0] }, rest: items.slice(1) }),
  "get-word": (store, items) => ({ term: { kind: "jump", word: items[0] }, rest: items.slice(1) }),
  paren: (store, items) => ({ term: { kind: "paren", paren: items[0] }, rest: items.slice(1) }),
  block: (store, items) => ({ term: { kind: "block", block: items[0] }, rest: items.slice(1) }),
};

/**
 * @uses TAKERS
 * @usedby takeInner, takeWithWord, takeCount, takeWord, matchSequence
 */
const takeTerm = (store, items) => {
  // A command at the end of the rule block has no term. Then the term matches nothing.
  if (items.length === 0) return { term: { kind: "none" }, rest: [] };
  const taker = TAKERS[items[0].type];
  return taker === undefined ? { term: { kind: "value", value: items[0] }, rest: items.slice(1) } : taker(store, items);
};

/**
 * @uses takeTerm, matchTerm
 * @usedby matchBlock
 */
const matchSequence = (rules, state, items) => {
  if (items.length === 0) return state;
  const taken = takeTerm(state.store, items);
  const next = matchTerm(rules, state, taken.term);
  return next.ok ? matchSequence(rules, next, taken.rest) : next;
};

/**
 * @usedby splitChoices
 */
const isBar = (item) => item.type === "word" && item.value === "|";

/**
 * @uses isBar
 * @usedby matchBlock
 */
const splitChoices = (items) =>
  items.reduce(
    (groups, item) => (isBar(item) ? [...groups, []] : [...groups.slice(0, -1), [...groups[groups.length - 1], item]]),
    [[]],
  );

/**
 * @uses matchSequence, splitChoices, readRest (src/store/store.mjs), failState
 * @usedby matchInner, parseSeries
 */
const matchBlock = (rules, state, block) => {
  // The first choice that matches gives the result. A later choice keeps the changes that a failed choice made to words.
  const tryChoice = (found, items) => {
    if (found.ok || found.thrown !== undefined) return found;
    return matchSequence(rules, { ...state, store: found.store }, items);
  };
  return splitChoices(readRest(state.store, block)).reduce(tryChoice, failState(state));
};

/**
 * @uses readRest (src/store/store.mjs)
 * @usedby parseSeries
 */
const splitText = (machine, input, options) => {
  // Without /all, spaces also divide the text. Without a rule, a comma and a semicolon also divide it.
  const marks = options.marks.replace(/[\]\\^-]/g, "\\$&");
  const spaces = options.all ? "" : " \\t\\r\\n";
  const pattern = new RegExp(`"([^"]*)"|([^${marks}${spaces}]+)|([${marks}])${spaces === "" ? "" : `|[${spaces}]+`}`, "g");
  const addPart = (state, match) => {
    // A mark without a field before it gives an empty field.
    if (match[3] !== undefined) return { fields: state.had ? state.fields : [...state.fields, ""], had: false };
    const field = match[1] ?? match[2];
    return field === undefined ? state : { fields: [...state.fields, field], had: true };
  };
  return [...readRest(machine.store, input).matchAll(pattern)].reduce(addPart, { fields: [], had: false }).fields;
};

/**
 * @uses makeSeries (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby parseSeries
 */
const giveFields = (machine, fields) => {
  const addField = (made, field) => {
    const next = makeSeries(made.store, "string", field);
    return { store: next.store, values: [...made.values, next.value] };
  };
  const strings = fields.reduce(addField, { store: machine.store, values: [] });
  const made = makeSeries(strings.store, "block", strings.values);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses giveFields, splitText, isText (src/store/store.mjs), readRest (src/store/store.mjs), matchBlock,
 *   giveValue (src/machine/machine.mjs), makeLogic (src/machine/machine.mjs), readAll (src/store/store.mjs)
 * @usedby PARSE_NATIVES
 */
const parseSeries = (machine, [input, rule], options) => {
  // A rule that is none or a text divides the input into fields.
  const all = options.$all !== undefined;
  if (rule.type === "none") return giveFields(machine, splitText(machine, input, { marks: all ? "" : ",;", all }));
  if (isText(rule)) return giveFields(machine, splitText(machine, input, { marks: readRest(machine.store, rule), all }));
  // A rule block must match the input from its position to its end.
  const rules = { input, text: isText(input), exact: options.$case !== undefined, all };
  const done = matchBlock(rules, { store: machine.store, pos: input.value.index, ok: true }, rule);
  if (done.thrown !== undefined) return { ...machine, store: done.store, mode: "throw", thrown: done.thrown };
  return giveValue({ ...machine, store: done.store }, makeLogic(done.ok && done.pos >= readAll(done.store, input).length));
};

/**
 * The parse native. The entry has the name of REBOL and the function.
 * @uses parseSeries
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const PARSE_NATIVES = {
  parse: parseSeries,
};
