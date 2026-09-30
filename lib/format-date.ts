import { PLAYER_AGE_TIME_ZONE } from "./player-age";

/** Month-first written dates: "Jun 29, 2001". */
const DISPLAY_LOCALE = "en-US";

const dateParts = {
  month: "short",
  day: "numeric",
  year: "numeric",
} as const;

/** YYYY-MM-DD calendar days — parsed as UTC so the day never shifts. */
const calendarDateFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  timeZone: "UTC",
  ...dateParts,
});

/** Instants shown as a calendar day in academy time. */
const instantDateFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  timeZone: PLAYER_AGE_TIME_ZONE,
  ...dateParts,
});

/** Instants shown as date + time in academy time. */
const dateTimeFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  timeZone: PLAYER_AGE_TIME_ZONE,
  ...dateParts,
  hour: "numeric",
  minute: "2-digit",
});

function asDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/**
 * Format a stored calendar day (`YYYY-MM-DD`) for UI display.
 * Use for DOB, valid-from, pause days, and other date-only fields.
 */
export function formatCalendarDate(yyyyMmDd: string): string {
  const [year, month, day] = yyyyMmDd.split("-").map(Number);
  return calendarDateFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

/** Format an ISO instant as a calendar day in Asia/Kolkata. */
export function formatDate(value: string | Date): string {
  return instantDateFormatter.format(asDate(value));
}

/** Format an ISO instant as date + time in Asia/Kolkata. */
export function formatDateTime(value: string | Date): string {
  return dateTimeFormatter.format(asDate(value));
}
