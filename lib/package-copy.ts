export function formatInr(feePaise: number): string {
  return `₹${(feePaise / 100).toLocaleString("en-IN")}`;
}

export function daysCopy(daysPerWeek: number): string {
  return daysPerWeek === 1 ? "1 day per week" : `${daysPerWeek} days per week`;
}

export function termCopy(termDays: number): string {
  return termDays === 1 ? "1 day" : `${termDays} days`;
}

export function packageFactsCopy(option: {
  daysPerWeek: number;
  termDays: number;
  feePaise: number;
}): string {
  return `${daysCopy(option.daysPerWeek)} · ${termCopy(option.termDays)} · ${formatInr(option.feePaise)}`;
}
