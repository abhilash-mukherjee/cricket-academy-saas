const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isAcademySlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

export function suggestAcademySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
