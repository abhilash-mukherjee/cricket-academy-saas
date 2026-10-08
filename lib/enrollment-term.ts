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

export type RecordedStart =
  | {
      ok: true;
      validFrom: string;
      validUntil: string;
      deferred: { pausedOn: string; plannedLastPausedOn: string } | null;
    }
  | { ok: false; error: "term-not-covering-today" };

/**
 * Today or earlier is valid-from and creates no pause.
 * A later start stores valid-from as today and a dated pause through the day before that start.
 * A term that is already over is rejected. There is no cap on how far ahead.
 */
export function recordedStart(
  startsOn: string,
  termDays: number,
  today: string,
): RecordedStart {
  if (startsOn > today) {
    return {
      ok: true,
      validFrom: today,
      validUntil: lastCoveredDay(today, termDays),
      deferred: {
        pausedOn: today,
        plannedLastPausedOn: addCalendarDays(startsOn, -1),
      },
    };
  }

  const validUntil = lastCoveredDay(startsOn, termDays);
  if (validUntil < today) {
    return { ok: false, error: "term-not-covering-today" };
  }
  return { ok: true, validFrom: startsOn, validUntil, deferred: null };
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

export type RealPauseSpan = {
  pausedOn: string;
  plannedLastPausedOn: string | null;
  resumedOn: string | null;
  isDeferred: boolean;
};

/** Real pauses only: finished in full, open through today, deferred starts as none. */
export function realPausedDays(pauses: RealPauseSpan[], today: string): number {
  let total = 0;
  for (const pause of pauses) {
    if (pause.isDeferred) {
      continue;
    }
    total += realPauseSpanDays(pause, today);
  }
  return total;
}

function realPauseSpanDays(pause: RealPauseSpan, today: string): number {
  const end = pauseEndExclusive(pause);
  const dayAfterToday = addCalendarDays(today, 1);
  const endExclusive =
    end === null || end > dayAfterToday ? dayAfterToday : end;
  return calendarDaysBetween(pause.pausedOn, endExclusive);
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
