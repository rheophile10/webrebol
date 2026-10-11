import { makeDatum } from "../data/datum.mjs";
import { makeDate } from "../data/dates.mjs";
import { readField } from "../store/parts.mjs";
import { askEdge, giveValue, makeWord } from "../machine/machine.mjs";

const MILLISECOND = 1e6;
const MINUTE = 60e9;
const DAY_MILLISECONDS = 86400000;
const FIELDS = { $year: "year", $month: "month", $day: "day", $weekday: "weekday", $yearday: "julian", $time: "time", $zone: "zone" };

/**
 * @uses DAY_MILLISECONDS, MILLISECOND, makeDatum (src/data/datum.mjs), makeDate (src/data/dates.mjs), MINUTE
 * @usedby giveMoment
 */
const makeMoment = (answer, options) => {
  // The edge gives the time of the world in milliseconds and the offset of the local zone in minutes.
  const offset = options.$utc === undefined ? answer.offset : 0;
  const local = answer.milliseconds + offset * 60000;
  const days = Math.floor(local / DAY_MILLISECONDS);
  const rest = local - days * DAY_MILLISECONDS;
  // Without /precise, the time has full seconds.
  const time = (options.$precise === undefined ? Math.floor(rest / 1000) * 1000 : rest) * MILLISECOND;
  return makeDatum("date", makeDate(days, time, offset * MINUTE));
};

/**
 * @uses makeMoment, FIELDS, giveValue (src/machine/machine.mjs), readField (src/store/parts.mjs),
 *   makeWord (src/machine/machine.mjs), makeDatum (src/data/datum.mjs)
 * @usedby readClock
 */
const giveMoment = (machine, answer, options) => {
  // A refinement gives one field of the date and time.
  const moment = makeMoment(answer, options);
  const name = Object.keys(FIELDS).find((key) => options[key] !== undefined);
  if (name !== undefined) return giveValue(machine, readField(moment, makeWord(FIELDS[name])));
  if (options.$date === undefined) return giveValue(machine, moment);
  return giveValue(machine, makeDatum("date", { ...moment.value, time: null, zone: 0 }));
};

/**
 * @uses askEdge (src/machine/machine.mjs), giveMoment
 * @usedby CLOCK_NATIVES
 */
const readClock = (machine, args, options) =>
  askEdge(machine, { kind: "clock", resume: (waiting, answer) => giveMoment(waiting, answer, options) });

/**
 * The natives that use the clock of the edge. Each entry has the name of REBOL and the function.
 * @uses readClock
 * @usedby NATIVES
 */
export const CLOCK_NATIVES = {
  now: readClock,
};
