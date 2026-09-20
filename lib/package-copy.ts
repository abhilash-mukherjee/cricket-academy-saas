export function formatInr(feePaise: number): string {
  return `₹${(feePaise / 100).toLocaleString("en-IN")}`;
}

export function daysCopy(daysPerWeek: number): string {
  return daysPerWeek === 1 ? "1 day per week" : `${daysPerWeek} days per week`;
}

export function termCopy(termMonths: number): string {
  return termMonths === 1 ? "1 month" : `${termMonths} months`;
}

export function packageFactsCopy(option: {
  daysPerWeek: number;
  termMonths: number;
  feePaise: number;
}): string {
  return `${daysCopy(option.daysPerWeek)} · ${termCopy(option.termMonths)} · ${formatInr(option.feePaise)}`;
}
