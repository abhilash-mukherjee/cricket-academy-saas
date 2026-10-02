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

/** First day not paused, or null when the pause is open-ended and still open. */
export function pauseEndExclusive(pause: {
  pausedOn: string;
  plannedLastPausedOn: string | null;
  resumedOn: string | null;
}): string | null {
  if (pause.resumedOn !== null) {
    return pause.resumedOn;
  }
  if (pause.plannedLastPausedOn !== null) {
    return addCalendarDays(pause.plannedLastPausedOn, 1);
  }
  return null;
}

/** True when `date` falls in the pause. Closed at the end day (the first day not paused). */
export function pauseCoversDate(
  pause: {
    pausedOn: string;
    plannedLastPausedOn: string | null;
    resumedOn: string | null;
  },
  date: string,
): boolean {
  if (date < pause.pausedOn) {
    return false;
  }
  const end = pauseEndExclusive(pause);
  return end === null || date < end;
}

/** Half-open intervals `[start, endExclusive)`; null end means unbounded. */
export function pauseIntervalsOverlap(
  left: { start: string; endExclusive: string | null },
  right: { start: string; endExclusive: string | null },
): boolean {
  const leftEndsAfterRightStarts =
    left.endExclusive === null || left.endExclusive > right.start;
  const rightEndsAfterLeftStarts =
    right.endExclusive === null || right.endExclusive > left.start;
  return leftEndsAfterRightStarts && rightEndsAfterLeftStarts;
}
