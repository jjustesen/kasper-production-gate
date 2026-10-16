// Business-day arithmetic (Mon-Fri, no holiday calendar) and date formatting.
// All dates are calendar days in UTC, so time zones can't shift a due date.

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10-20" -> a Date at UTC midnight, or null if it isn't a valid date. */
export function parseDate(text: string | null | undefined): Date | null {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The calendar day of a timestamp, at UTC midnight. */
export function dayOf(moment: Date): Date {
  return new Date(Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), moment.getUTCDate()));
}

const isWeekday = (d: Date) => d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
const nextDay = (d: Date) => new Date(d.getTime() + DAY_MS);

/** Business days in (start, end]. The start day is day 0 and never counts. 0 when end <= start. */
export function businessDaysBetween(start: Date, end: Date): number {
  let days = 0;
  for (let d = nextDay(start); d <= end; d = nextDay(d)) {
    if (isWeekday(d)) days += 1;
  }
  return days;
}

/** The earliest date that is n business days after start. */
export function addBusinessDays(start: Date, n: number): Date {
  let d = start;
  let added = 0;
  while (added < n) {
    d = nextDay(d);
    if (isWeekday(d)) added += 1;
  }
  return d;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "Wed 14 Oct" */
export const shortDay = (d: Date) =>
  `${DAYS[d.getUTCDay()].slice(0, 3)} ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;

/** "Friday 16 October" */
export const longDay = (d: Date) => `${DAYS[d.getUTCDay()]} ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}`;

/** "Tuesday 13 October 2026, 09:00" */
export const longDateTime = (d: Date) =>
  `${longDay(d)} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

/** "Tue 13 Oct 09:00" */
export const shortDateTime = (d: Date) => `${shortDay(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

/** "2026-10-13T09:00:00+00:00" */
export const isoUtc = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "+00:00");
