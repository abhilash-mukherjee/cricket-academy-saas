import { describe, expect, it } from "vitest";
import {
  ACADEMY_THEME_ACCENTS,
  ACADEMY_THEME_MODES,
  DEFAULT_ABOUT_LABEL,
  academyThemeAccentSchema,
  academyThemeModeSchema,
  isAcademyThemeAccent,
  isAcademyThemeMode,
  publicAcademyThemeStyle,
  resolveAboutLabel,
  resolveAcademyThemeAccent,
  resolveAcademyThemeMode,
} from "./academy-theme";

describe("academy theme modes", () => {
  it("exposes dark and light modes and validates them strictly", () => {
    expect(ACADEMY_THEME_MODES).toEqual(["dark", "light"]);
    expect(isAcademyThemeMode("dark")).toBe(true);
    expect(isAcademyThemeMode("light")).toBe(true);
    expect(isAcademyThemeMode("")).toBe(false);
    expect(isAcademyThemeMode(null)).toBe(false);
    expect(isAcademyThemeMode(undefined)).toBe(false);
    expect(isAcademyThemeMode("system")).toBe(false);
    expect(isAcademyThemeMode(123)).toBe(false);
  });
});

describe("academy theme accents", () => {
  it("exposes the 8 curated swatches and validates them strictly", () => {
    expect(ACADEMY_THEME_ACCENTS).toEqual([
      "default",
      "emerald",
      "blue",
      "crimson",
      "amber",
      "violet",
      "teal",
      "orange",
    ]);

    for (const accent of ACADEMY_THEME_ACCENTS) {
      expect(isAcademyThemeAccent(accent)).toBe(true);
    }

    expect(isAcademyThemeAccent("")).toBe(false);
    expect(isAcademyThemeAccent(null)).toBe(false);
    expect(isAcademyThemeAccent(undefined)).toBe(false);
    expect(isAcademyThemeAccent("pink")).toBe(false);
    expect(isAcademyThemeAccent(42)).toBe(false);
  });

  it("maps each swatch to --color-primary and --color-primary-content CSS custom properties", () => {
    expect(publicAcademyThemeStyle("default")).toEqual({
      "--color-primary": "var(--color-base-content)",
      "--color-primary-content": "var(--color-base-100)",
    });
    expect(publicAcademyThemeStyle("emerald")).toEqual({
      "--color-primary": "#10b981",
      "--color-primary-content": "#022c22",
    });
    expect(publicAcademyThemeStyle("blue")).toEqual({
      "--color-primary": "#2563eb",
      "--color-primary-content": "#ffffff",
    });
    expect(publicAcademyThemeStyle("crimson")).toEqual({
      "--color-primary": "#e11d48",
      "--color-primary-content": "#ffffff",
    });
    expect(publicAcademyThemeStyle("amber")).toEqual({
      "--color-primary": "#f59e0b",
      "--color-primary-content": "#111827",
    });
    expect(publicAcademyThemeStyle("violet")).toEqual({
      "--color-primary": "#7c3aed",
      "--color-primary-content": "#ffffff",
    });
    expect(publicAcademyThemeStyle("teal")).toEqual({
      "--color-primary": "#0d9488",
      "--color-primary-content": "#ffffff",
    });
    expect(publicAcademyThemeStyle("orange")).toEqual({
      "--color-primary": "#ea580c",
      "--color-primary-content": "#ffffff",
    });
  });

  it("exposes Zod schemas and normalization helpers with safe defaults", () => {
    expect(academyThemeModeSchema.safeParse("light").success).toBe(true);
    expect(academyThemeModeSchema.safeParse("sepia").success).toBe(false);
    expect(academyThemeAccentSchema.safeParse("teal").success).toBe(true);
    expect(academyThemeAccentSchema.safeParse("pink").success).toBe(false);

    expect(resolveAcademyThemeMode("light")).toBe("light");
    expect(resolveAcademyThemeMode("invalid")).toBe("dark");
    expect(resolveAcademyThemeMode(null)).toBe("dark");

    expect(resolveAcademyThemeAccent("crimson")).toBe("crimson");
    expect(resolveAcademyThemeAccent("invalid")).toBe("default");
    expect(resolveAcademyThemeAccent(undefined)).toBe("default");

    expect(resolveAboutLabel("Our Story")).toBe("Our Story");
    expect(resolveAboutLabel("  Academy   ")).toBe("Academy");
    expect(resolveAboutLabel("   ")).toBe(DEFAULT_ABOUT_LABEL);
    expect(resolveAboutLabel(null)).toBe(DEFAULT_ABOUT_LABEL);
    expect(resolveAboutLabel(undefined)).toBe(DEFAULT_ABOUT_LABEL);
  });
});
