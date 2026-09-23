/** Last covered day, counting valid-from as day one of the term. */
export function lastCoveredDay(validFrom: string, termDays: number): string {
  const [year, month, day] = validFrom.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + termDays - 1);
  const coveredYear = date.getUTCFullYear();
  const coveredMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const coveredDay = String(date.getUTCDate()).padStart(2, "0");
  return `${coveredYear}-${coveredMonth}-${coveredDay}`;
}
