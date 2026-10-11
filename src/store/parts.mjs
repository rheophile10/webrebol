/** @import { Datum } from "../types/states.mjs" */
import { makeDatum } from "../data/datum.mjs";
import { countDays, makeDate, readDays } from "../data/dates.mjs";

const NANOSECONDS = 1e9;
/**
 * @uses NANOSECONDS
 * @usedby readTimeParts, writeTime
 */
const HOUR = 3600 * NANOSECONDS;
/**
 * @uses NANOSECONDS
 * @usedby readTimeParts, writeTime
 */
const MINUTE = 60 * NANOSECONDS;

/**
 * @uses makeDatum (src/data/datum.mjs)
 * @usedby readTimeParts, readDateParts, READERS
 */
const makeInteger = (number) => makeDatum("integer", number);

/**
 * @uses makeDatum (src/data/datum.mjs), MINUTE, NANOSECONDS, makeInteger, HOUR
 * @usedby READERS, writeTime
 */
const readTimeParts = (time) => {
  const size = Math.abs(time.value);
  const seconds = makeDatum("decimal", (size % MINUTE) / NANOSECONDS);
  return { hour: makeInteger(Math.floor(size / HOUR)), minute: makeInteger(Math.floor((size % HOUR) / MINUTE)), second: seconds };
};

/**
 * @uses readDays (src/data/dates.mjs), countDays (src/data/dates.mjs), makeDatum (src/data/datum.mjs), makeInteger
 * @usedby READERS
 */
const readDateParts = (date) => {
  // The first day of the week is Monday. The julian day is the day of the year.
  const parts = readDays(date.value.days);
  const weekday = ((((date.value.days + 3) % 7) + 7) % 7) + 1;
  const julian = date.value.days - countDays(parts.year, 1, 1) + 1;
  const time = date.value.time === null ? makeDatum("none", null) : makeDatum("time", date.value.time);
  const numbers = { year: parts.year, month: parts.month, day: parts.day, weekday, julian };
  const fields = Object.fromEntries(Object.entries(numbers).map(([name, number]) => [name, makeInteger(number)]));
  return { ...fields, time, zone: makeDatum("time", date.value.zone) };
};

/**
 * @uses readTimeParts, readDateParts, makeInteger
 * @usedby readField, writeField
 */
const READERS = {
  time: readTimeParts,
  date: readDateParts,
  pair: (pair) => ({ x: makeInteger(pair.value[0]), y: makeInteger(pair.value[1]) }),
  tuple: (tuple) => Object.fromEntries(tuple.value.map((byte, place) => [place + 1, makeInteger(byte)])),
};

/**
 * Gets a part of a value that is not a series: a field of a time, a pair, a tuple or a date.
 * @param {Datum} value
 * @param {Datum} part - A word with the name of the field, or an integer with its position.
 * @returns {Datum | null | undefined}
 * @standard absent - A field that the type does not have gives null. A type without fields gives undefined.
 * @uses READERS
 * @usedby selectPart (src/machine/path.mjs), OTHER_TYPES (src/natives/series.mjs), takeItem (src/natives/series.mjs)
 */
export const readField = (value, part) => {
  const reader = READERS[value.type];
  if (reader === undefined) return undefined;
  const fields = reader(value);
  const name = part.type === "integer" ? Object.keys(fields)[part.value - 1] : String(part.value).toLowerCase();
  return fields[value.type === "tuple" ? String(part.value) : name] ?? null;
};

/**
 * @uses readTimeParts, makeDatum (src/data/datum.mjs), HOUR, MINUTE, NANOSECONDS
 * @usedby WRITERS
 */
const writeTime = (time, name, number) => {
  const parts = readTimeParts(time);
  const next = { hour: parts.hour.value, minute: parts.minute.value, second: parts.second.value, [name]: number };
  return makeDatum("time", Math.round(next.hour * HOUR + next.minute * MINUTE + next.second * NANOSECONDS));
};

/**
 * @uses makeDatum (src/data/datum.mjs), makeDate (src/data/dates.mjs), readDays (src/data/dates.mjs),
 *   countDays (src/data/dates.mjs)
 * @usedby WRITERS
 */
const writeDate = (date, name, value) => {
  // A month or a day that is out of range moves the date into the next month or year.
  if (name === "time") return makeDatum("date", makeDate(date.value.days, value.value, date.value.zone));
  const parts = { ...readDays(date.value.days), [name]: value.value };
  return makeDatum("date", { ...date.value, days: countDays(parts.year, parts.month, parts.day) });
};

/**
 * @uses writeTime, writeDate, makeDatum (src/data/datum.mjs)
 * @usedby writeField
 */
const WRITERS = {
  time: (time, name, value) => writeTime(time, name, value.value),
  date: writeDate,
  pair: (pair, name, value) => makeDatum("pair", name === "x" ? [value.value, pair.value[1]] : [pair.value[0], value.value]),
  tuple: (tuple, name, value) => makeDatum("tuple", tuple.value.map((byte, place) => (String(place + 1) === name ? value.value : byte))),
};

/**
 * Makes a value that has a new value in one field.
 * @param {Datum} value - A time, a pair, a tuple or a date.
 * @param {Datum} part - A word with the name of the field, or an integer with its position.
 * @param {Datum} field - The new value of the field.
 * @returns {Datum | null}
 * @standard absent - A field that the type does not have gives null.
 * @uses READERS, WRITERS
 * @usedby stepSetPath (src/machine/path.mjs)
 */
export const writeField = (value, part, field) => {
  const fields = READERS[value.type]?.(value);
  if (fields === undefined) return null;
  const name = part.type === "integer" ? Object.keys(fields)[part.value - 1] : String(part.value).toLowerCase();
  return fields[name] === undefined ? null : WRITERS[value.type](value, name, field);
};
