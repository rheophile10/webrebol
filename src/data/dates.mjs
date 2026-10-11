const EPOCH_SHIFT = 719468;
const ERA_DAYS = 146097;

/**
 * The names of the months, as REBOL shows them in a date.
 */
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The number of nanoseconds in one day.
 */
export const DAY = 86400e9;

/**
 * Counts the days from 1-Jan-1970 to a date of the calendar. The month and the day can be outside their usual limits.
 * @param {number} year
 * @param {number} month - The month, where 1 is January.
 * @param {number} day
 * @returns {number}
 * @standard epoch - 1-Jan-1970 gives 0.
 * @uses ERA_DAYS, EPOCH_SHIFT
 * @usedby readDate, makeDateFrom (src/natives/convert.mjs), readDateParts (src/store/parts.mjs),
 *   writeDate (src/store/parts.mjs)
 */
export const countDays = (year, month, day) => {
  // Put a month that is out of range into its year.
  const months = year * 12 + month - 1;
  const full = Math.floor(months / 12);
  const turned = months - full * 12 + 1;
  // Start the year in March, so that the day of a leap year is at the end.
  const shifted = turned <= 2 ? full - 1 : full;
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear = Math.floor((153 * (turned + (turned > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * ERA_DAYS + dayOfEra - EPOCH_SHIFT;
};

/**
 * @usedby readDays
 */
const findYearOfEra = (dayOfEra) =>
  Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);

/**
 * Finds the year, the month and the day of a count of days from 1-Jan-1970.
 * @param {number} days
 * @returns {{ year: number, month: number, day: number }}
 * @standard inverse - The result gives the same count of days again.
 * @uses EPOCH_SHIFT, ERA_DAYS, findYearOfEra
 * @usedby readDate, moldDate (src/store/mold.mjs), readDateParts (src/store/parts.mjs),
 *   writeDate (src/store/parts.mjs)
 */
export const readDays = (days) => {
  const shifted = days + EPOCH_SHIFT;
  const era = Math.floor(shifted / ERA_DAYS);
  const dayOfEra = shifted - era * ERA_DAYS;
  const yearOfEra = findYearOfEra(dayOfEra);
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const turned = Math.floor((5 * dayOfYear + 2) / 153);
  const month = turned < 10 ? turned + 3 : turned - 9;
  const day = dayOfYear - Math.floor((153 * turned + 2) / 5) + 1;
  return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day };
};

/**
 * Makes the data of a date value. A time that is not in one day moves the date.
 * @param {number} days - The count of days from 1-Jan-1970.
 * @param {number | null} time - The time of the day in nanoseconds, or null for a date without a time.
 * @param {number} zone - The time zone in nanoseconds.
 * @returns {{ days: number, time: number | null, zone: number }}
 * @standard carry - A time of 25 hours gives the next day and 1 hour.
 * @uses DAY
 * @usedby readDate, makeDateFrom (src/natives/convert.mjs), combineDate (src/natives/scalars.mjs),
 *   writeDate (src/store/parts.mjs)
 */
export const makeDate = (days, time, zone) => {
  if (time === null) return { days, time, zone };
  const extra = Math.floor(time / DAY);
  return { days: days + extra, time: time - extra * DAY, zone };
};
