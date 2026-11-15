import type { CSSProperties } from "react";
import { z } from "zod";

export const DEFAULT_ABOUT_LABEL = "About Us";

export const ACADEMY_THEME_MODES = ["dark", "light"] as const;
export type AcademyThemeMode = (typeof ACADEMY_THEME_MODES)[number];
export const academyThemeModeSchema = z.enum(ACADEMY_THEME_MODES);

export const ACADEMY_THEME_ACCENTS = [
  "default",
  "emerald",
  "blue",
  "crimson",
  "amber",
  "violet",
  "teal",
  "orange",
] as const;
export type AcademyThemeAccent = (typeof ACADEMY_THEME_ACCENTS)[number];
export const academyThemeAccentSchema = z.enum(ACADEMY_THEME_ACCENTS);

export const ACADEMY_THEME_ACCENT_LABELS: Record<AcademyThemeAccent, string> = {
  default: "Default",
  emerald: "Emerald",
  blue: "Blue",
  crimson: "Crimson",
  amber: "Amber",
  violet: "Violet",
  teal: "Teal",
  orange: "Orange",
};

const ACADEMY_THEME_ACCENT_COLORS: Record<
  AcademyThemeAccent,
  { primary: string; primaryContent: string }
> = {
  default: {
    primary: "var(--color-base-content)",
    primaryContent: "var(--color-base-100)",
  },
  emerald: { primary: "#10b981", primaryContent: "#022c22" },
  blue: { primary: "#2563eb", primaryContent: "#ffffff" },
  crimson: { primary: "#e11d48", primaryContent: "#ffffff" },
  amber: { primary: "#f59e0b", primaryContent: "#111827" },
  violet: { primary: "#7c3aed", primaryContent: "#ffffff" },
  teal: { primary: "#0d9488", primaryContent: "#ffffff" },
  orange: { primary: "#ea580c", primaryContent: "#ffffff" },
};

/** Returns true when `value` is a supported Academy public theme mode. */
export function isAcademyThemeMode(value: unknown): value is AcademyThemeMode {
  return academyThemeModeSchema.safeParse(value).success;
}

/** Returns true when `value` is a supported Academy public accent swatch. */
export function isAcademyThemeAccent(
  value: unknown,
): value is AcademyThemeAccent {
  return academyThemeAccentSchema.safeParse(value).success;
}

/** Normalizes a stored or untrusted theme mode to a valid mode, defaulting to dark. */
export function resolveAcademyThemeMode(value: unknown): AcademyThemeMode {
  return isAcademyThemeMode(value) ? value : "dark";
}

/** Normalizes a stored or untrusted theme accent to a valid swatch, defaulting to default. */
export function resolveAcademyThemeAccent(value: unknown): AcademyThemeAccent {
  return isAcademyThemeAccent(value) ? value : "default";
}

/** Returns a trimmed custom About heading or falls back to the default label. */
export function resolveAboutLabel(value?: string | null): string {
  return value?.trim() || DEFAULT_ABOUT_LABEL;
}

/**
 * Returns CSS custom properties overriding DaisyUI's primary color tokens
 * for the selected Academy brand accent swatch.
 */
export function publicAcademyThemeStyle(
  themeAccent: AcademyThemeAccent,
): CSSProperties {
  const { primary, primaryContent } = ACADEMY_THEME_ACCENT_COLORS[themeAccent];
  return {
    "--color-primary": primary,
    "--color-primary-content": primaryContent,
  } as CSSProperties;
}
