function shiftCalendarDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const shiftedYear = date.getUTCFullYear();
  const shiftedMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const shiftedDay = String(date.getUTCDate()).padStart(2, "0");
  return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
}

/** Last covered day, counting valid-from as day one of the term. */
export function lastCoveredDay(validFrom: string, termDays: number): string {
  return shiftCalendarDate(validFrom, termDays - 1);
}

export function addCalendarDays(isoDate: string, days: number): string {
  return shiftCalendarDate(isoDate, days);
}

/** Whole calendar days from start inclusive through end exclusive. */
export function calendarDaysBetween(start: string, end: string): number {
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
  const endUtc = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.round((endUtc - startUtc) / 86_400_000);
}

export function rangesShareADay(
  leftFrom: string,
  leftUntil: string,
  rightFrom: string,
  rightUntil: string,
): boolean {
  return leftFrom <= rightUntil && rightFrom <= leftUntil;
}
