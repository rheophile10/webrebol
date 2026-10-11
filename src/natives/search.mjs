import { NONE, isList, isText, makeSeries, readAll, readRest, readValues } from "../store/store.mjs";
import { formValue } from "../store/mold.mjs";
import { failMachine, giveValue, makeLogic } from "../machine/machine.mjs";
import { areEqual, areSame, readOrder } from "./compare.mjs";
import { insertContent, makeContent, moveTo, pickItem } from "./series.mjs";
import { readPart, replaceItems } from "./edit.mjs";
import { hasBit } from "./bitsets.mjs";

const TYPE_RANKS = { word: 1, integer: 2, decimal: 2, char: 3, string: 4 };

/**
 * @usedby listPlaces, sortItems
 */
const countUp = (size) => Array.from({ length: Math.max(size, 0) });

/**
 * @uses readAll (src/store/store.mjs), hasBit
 * @usedby makeSearch
 */
const makeBitSearch = (store, [series, bitset]) => {
  // A bitset matches one character of a text, if the bitset has the code of the character.
  // REBOL gives the position of the character also with /tail and /match, and it ignores /last. Thus the size is 0.
  const all = readAll(store, series);
  return { all, wanted: " ", size: 0, matches: (place) => place < all.length && hasBit(bitset, all.charCodeAt(place)) };
};

/**
 * @uses isText (src/store/store.mjs), makeBitSearch, isList (src/store/store.mjs), readAll (src/store/store.mjs),
 *   formValue (src/store/mold.mjs), readRest (src/store/store.mjs), areSame, areEqual
 * @usedby searchSeries, replaceInList
 */
const makeSearch = (store, [series, value], options) => {
  // In a text, the search is for the formed value. In a list, a block is a sequence of items, but not with /only.
  const exact = options.$case !== undefined;
  if (isText(series) && value.type === "bitset") return makeBitSearch(store, [series, value]);
  if (!isList(series)) {
    const texts = [readAll(store, series), formValue(store, value)];
    const [all, wanted] = exact ? texts : texts.map((text) => text.toLowerCase());
    return { all, wanted, matches: (place) => all.startsWith(wanted, place) };
  }
  const all = readAll(store, series);
  const wanted = value.type === "block" && options.$only === undefined ? readRest(store, value) : [value];
  // With /case, a word must also have the same spelling.
  const sameCase = (store0, left, right) =>
    areSame(store0, left, right) && (typeof left.value !== "string" || left.value === right.value);
  const test = exact ? sameCase : areEqual;
  const matchItem = (place) => (item, offset) => all[place + offset] !== undefined && test(store, all[place + offset], item);
  return { all, wanted, matches: (place) => wanted.every(matchItem(place)) };
};

/**
 * @uses countUp, readPart
 * @usedby searchSeries
 */
const listPlaces = (series, total, options) => {
  // Give the positions to examine, in the sequence of the search.
  const index = series.value.index;
  if (options.$match !== undefined) return [index];
  if (options.$reverse !== undefined) return countUp(index).map((item, place) => index - 1 - place);
  const step = options.$skip === undefined ? 1 : options.$skip[0].value;
  const limit = options.$part === undefined ? total : Math.min(index + readPart(series, options.$part[0]), total);
  const forward = countUp(Math.ceil((limit - index) / step)).map((item, place) => index + place * step);
  return options.$last === undefined ? forward : [...forward].reverse();
};

/**
 * @uses makeSearch, listPlaces
 * @usedby findValue, selectValue, alterValue
 */
const searchSeries = (store, pair, options) => {
  // Give the position of the first match and the size of the match, or null.
  const search = makeSearch(store, pair, options);
  if (search.wanted.length === 0) return null;
  const places = listPlaces(pair[0], search.all.length, search.size === 0 ? { ...options, $last: undefined } : options);
  const place = places.find(search.matches);
  return place === undefined ? null : { place, size: search.size ?? search.wanted.length };
};

/**
 * @uses searchSeries, giveValue (src/machine/machine.mjs), NONE (src/store/store.mjs), moveTo
 * @usedby SEARCH_NATIVES
 */
const findValue = (machine, pair, options) => {
  // With /tail or /match, the result is the position after the match.
  const found = searchSeries(machine.store, pair, options);
  const after = options.$tail !== undefined || options.$match !== undefined;
  return giveValue(machine, found === null ? NONE : moveTo(pair[0], found.place + (after ? found.size : 0)));
};

/**
 * @uses searchSeries, pickItem, moveTo, giveValue (src/machine/machine.mjs), NONE (src/store/store.mjs)
 * @usedby SEARCH_NATIVES
 */
const selectValue = (machine, pair, options) => {
  // The result is the item after the match.
  const found = searchSeries(machine.store, pair, options);
  const item = found === null ? null : pickItem(machine.store, moveTo(pair[0], found.place), found.size);
  return giveValue(machine, item ?? NONE);
};

/**
 * @uses makeSearch, makeContent
 * @usedby replaceValue
 */
const replaceInList = (store, args, every) => {
  // Go through the items one time. A match gives the new items, and the old items of the match are skipped.
  const [series, wanted, value] = args;
  const search = makeSearch(store, [series, wanted], {});
  const content = makeContent(store, [series, value], false);
  const step = (state, item, place) => {
    if (state.skip > 0) return { ...state, skip: state.skip - 1 };
    const match = place >= series.value.index && (every || !state.done) && search.matches(place);
    if (!match) return { ...state, out: [...state.out, item] };
    return { out: [...state.out, ...content], skip: search.wanted.length - 1, done: true };
  };
  return search.wanted.length === 0 ? search.all : search.all.reduce(step, { out: [], skip: 0, done: false }).out;
};

/**
 * @uses readAll (src/store/store.mjs), formValue (src/store/mold.mjs)
 * @usedby replaceValue
 */
const replaceInText = (store, args, every) => {
  // A pattern without special characters finds the text, without regard to case.
  const [series, wanted, value] = args;
  const all = readAll(store, series);
  const pattern = new RegExp(formValue(store, wanted).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), every ? "gi" : "i");
  const head = all.slice(0, series.value.index);
  return head + all.slice(series.value.index).replace(pattern, () => formValue(store, value));
};

/**
 * @uses isList (src/store/store.mjs), replaceInList, replaceInText, readAll (src/store/store.mjs),
 *   giveValue (src/machine/machine.mjs), replaceItems, moveTo
 * @usedby SEARCH_NATIVES
 */
const replaceValue = (machine, args, options) => {
  const every = options.$all !== undefined;
  const content = isList(args[0]) ? replaceInList(machine.store, args, every) : replaceInText(machine.store, args, every);
  const size = readAll(machine.store, args[0]).length;
  return giveValue(replaceItems(machine, moveTo(args[0], 0), { content, size }), args[0]);
};

/**
 * @uses searchSeries, giveValue (src/machine/machine.mjs), replaceItems, moveTo, makeLogic (src/machine/machine.mjs),
 *   readAll (src/store/store.mjs), insertContent, makeContent
 * @usedby SEARCH_NATIVES
 */
const alterValue = (machine, pair) => {
  // A value that is in the series is removed. A value that is not there is added.
  const found = searchSeries(machine.store, pair, {});
  if (found !== null) {
    return giveValue(replaceItems(machine, moveTo(pair[0], found.place), { content: [], size: found.size }), makeLogic(false));
  }
  const tail = moveTo(pair[0], readAll(machine.store, pair[0]).length);
  return giveValue(insertContent(machine, tail, makeContent(machine.store, pair, false)), makeLogic(true));
};

/**
 * @uses makeSeries (src/store/store.mjs), giveValue (src/machine/machine.mjs)
 * @usedby extractItems, giveSet
 */
const giveBlock = (machine, type, content) => {
  const made = makeSeries(machine.store, type, content);
  return giveValue({ ...machine, store: made.store }, made.value);
};

/**
 * @uses readRest (src/store/store.mjs), giveBlock
 * @usedby SEARCH_NATIVES
 */
const extractItems = (machine, [series, width], options) => {
  // Take one item of each group. With /index, take the item at that position of the group.
  const items = readRest(machine.store, series);
  const first = options.$index === undefined ? 0 : options.$index[0].value - 1;
  const taken = items.filter((item, place) => place % width.value === first);
  return giveBlock(machine, "block", taken);
};

/**
 * @uses areEqual
 * @usedby giveSet
 */
const makeUnique = (store, values) =>
  values.filter((value, place) => values.findIndex((other) => areEqual(store, other, value)) === place);

/**
 * @uses makeUnique, isList (src/store/store.mjs), giveBlock
 * @usedby combine
 */
const giveSet = (machine, series, values) => {
  // The result has the type of the first series. A text is made from its chars.
  const unique = makeUnique(machine.store, values);
  const content = isList(series) ? unique : unique.map((char) => String.fromCharCode(char.value)).join("");
  return giveBlock(machine, series.type, content);
};

/**
 * @uses readValues (src/store/store.mjs), areEqual, giveSet
 * @usedby SEARCH_NATIVES
 */
const combine = (select) => (machine, [first, second]) => {
  const left = readValues(machine.store, first);
  const right = second === undefined ? [] : readValues(machine.store, second);
  const isIn = (values) => (value) => values.some((other) => areEqual(machine.store, other, value));
  return giveSet(machine, first, select(left, right, isIn));
};

/**
 * @uses readOrder, TYPE_RANKS, readRest (src/store/store.mjs)
 * @usedby sortItems
 */
const compareItems = (store, exact) => (left, right) => {
  // Values of different types are in the sequence of their types.
  const first = readOrder(store, left) ?? { group: left.type, data: String(left.value).toLowerCase() };
  const second = readOrder(store, right) ?? { group: right.type, data: String(right.value).toLowerCase() };
  if (first.group !== second.group) return (TYPE_RANKS[left.type] ?? 9) - (TYPE_RANKS[right.type] ?? 9);
  const [low, high] = exact && left.type === "string" ? [readRest(store, left), readRest(store, right)] : [first.data, second.data];
  if (low === high) return 0;
  return low < high ? -1 : 1;
};

/**
 * @uses readRest (src/store/store.mjs), NONE (src/store/store.mjs)
 * @usedby sortItems
 */
const compareLists = (store, compare) => (left, right) => {
  // A block is compared by its first item. Other values are compared directly.
  const first = left.type === "block" ? (readRest(store, left)[0] ?? NONE) : left;
  const second = right.type === "block" ? (readRest(store, right)[0] ?? NONE) : right;
  return compare(first, second);
};

/**
 * @uses readRest (src/store/store.mjs)
 * @usedby sortItems
 */
const readFields = (store, option) => {
  // With /compare, an integer or a block of integers gives the fields of a record that the order uses.
  if (option?.type === "integer") return [option.value - 1];
  const fields = option?.type === "block" ? readRest(store, option).filter((item) => item.type === "integer").map((item) => item.value - 1) : [];
  return fields.length === 0 ? [0] : fields;
};

/**
 * @uses readValues (src/store/store.mjs), failMachine (src/machine/machine.mjs), countUp, compareLists, compareItems,
 *   readFields, NONE (src/store/store.mjs), isList (src/store/store.mjs), giveValue (src/machine/machine.mjs),
 *   replaceItems
 * @usedby SEARCH_NATIVES
 */
const sortItems = (machine, [series], options) => {
  // The items from the position are sorted. Equal items keep their sequence. With /skip, a number of items is one record.
  const values = readValues(machine.store, series);
  const size = options.$skip === undefined ? 1 : options.$skip[0].value;
  if (size < 1 || values.length % size !== 0) return failMachine(machine, "script invalid-arg", [options.$skip[0]]);
  const records = countUp(values.length / size).map((unused, place) => values.slice(place * size, (place + 1) * size));
  const compare = compareLists(machine.store, compareItems(machine.store, options.$case !== undefined));
  const fields = readFields(machine.store, options.$compare?.[0]);
  const order = (left, right) => fields.reduce((found, field) => (found !== 0 ? found : compare(left[field] ?? NONE, right[field] ?? NONE)), 0);
  // With /reverse, the comparison is the opposite. Thus equal items keep their sequence.
  const ordered = [...records].sort(options.$reverse === undefined ? order : (left, right) => order(right, left)).flat();
  const content = isList(series) ? ordered : ordered.map((char) => String.fromCharCode(char.value)).join("");
  return giveValue(replaceItems(machine, series, { content, size: values.length }), series);
};

/**
 * The natives that search, compare and sort the items of a series. Each entry has the name of REBOL and the function.
 * @uses findValue, selectValue, replaceValue, alterValue, extractItems, combine, sortItems
 * @usedby NATIVES (src/session/globals.mjs)
 */
export const SEARCH_NATIVES = {
  find: findValue,
  select: selectValue,
  replace: replaceValue,
  alter: alterValue,
  extract: extractItems,
  unique: combine((left) => left),
  union: combine((left, right) => [...left, ...right]),
  intersect: combine((left, right, isIn) => left.filter(isIn(right))),
  difference: combine((left, right, isIn) => [...left.filter((value) => !isIn(right)(value)), ...right.filter((value) => !isIn(left)(value))]),
  exclude: combine((left, right, isIn) => left.filter((value) => !isIn(right)(value))),
  sort: sortItems,
};
