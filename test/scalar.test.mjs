import { test } from "node:test";
import assert from "node:assert/strict";
import { countDays, makeDate, readDays } from "../src/data/dates.mjs";
import { readField, writeField } from "../src/store/parts.mjs";
import { changeScalar, combineScalars } from "../src/natives/scalars.mjs";
import { measureText } from "../src/view/data.mjs";

const HOUR = 3600e9;
const ADD = { name: "add", operation: (left, right) => left + right };

test("countDays epoch: 1-Jan-1970 gives 0", () => {
  assert.equal(countDays(1970, 1, 1), 0);
  assert.equal(countDays(2000, 3, 1), 11017);
});

test("readDays inverse: the parts of a count give the same count", () => {
  assert.deepEqual(readDays(countDays(2020, 2, 29)), { year: 2020, month: 2, day: 29 });
  assert.deepEqual(readDays(countDays(1, 1, 1)), { year: 1, month: 1, day: 1 });
});

test("makeDate carry: a time of 25 hours gives the next day and 1 hour", () => {
  assert.deepEqual(makeDate(10, 25 * HOUR, 0), { days: 11, time: HOUR, zone: 0 });
});

test("readField absent: a pair has no third field, and an integer has no fields", () => {
  const pair = { type: "pair", value: [3, 4] };
  assert.equal(readField(pair, { type: "integer", value: 3 }), null);
  assert.equal(readField(pair, { type: "word", value: "y" }).value, 4);
  assert.equal(readField({ type: "integer", value: 1 }, { type: "integer", value: 1 }), undefined);
});

test("writeField absent: a field that a time does not have gives null", () => {
  const time = { type: "time", value: HOUR };
  assert.equal(writeField(time, { type: "word", value: "year" }, { type: "integer", value: 1 }), null);
  assert.equal(writeField(time, { type: "word", value: "hour" }, { type: "integer", value: 2 }).value, 2 * HOUR);
});

test("combineScalars none: a time and a pair do not go together", () => {
  const time = { type: "time", value: HOUR };
  assert.equal(combineScalars(ADD, time, { type: "pair", value: [1, 1] }), null);
  assert.equal(combineScalars(ADD, time, { type: "integer", value: 30 }).value, HOUR + 30e9);
});

test("changeScalar none: an integer has no such operation", () => {
  assert.equal(changeScalar({ type: "integer", value: 1 }, Math.abs), null);
  assert.deepEqual(changeScalar({ type: "pair", value: [-1, 2] }, Math.abs).value, [1, 2]);
});

test("measureText overlap: a text of the usual font is narrower than the sum of its characters", () => {
  assert.deepEqual(measureText("a", null), [8, 14]);
  assert.deepEqual(measureText("ab", null), [15, 14]);
  assert.deepEqual(measureText("", null), [0, 14]);
});
