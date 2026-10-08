export const PLAYER_AGE_TIME_ZONE = "Asia/Kolkata";

const IST_CALENDAR_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: PLAYER_AGE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function calendarDateInIst(now: Date = new Date()): string {
  return IST_CALENDAR_DATE.format(now);
}

export function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

export function isFutureDateOfBirth(
  dateOfBirth: string,
  now: Date = new Date(),
): boolean {
  return dateOfBirth > calendarDateInIst(now);
}

export function isPlayerUnder18(
  dateOfBirth: string,
  now: Date = new Date(),
): boolean {
  const [year, month, day] = dateOfBirth.split("-");
  const eighteenthBirthday = `${Number(year) + 18}-${month}-${day}`;
  return calendarDateInIst(now) < eighteenthBirthday;
}
