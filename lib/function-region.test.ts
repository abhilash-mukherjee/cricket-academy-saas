import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("vercel.json staff function regions", () => {
  it("pins /app and /api to Singapore near Neon", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      functions: Record<string, { regions: string[] }>;
    };

    expect(config.functions["app/app/**"].regions).toEqual(["sin1"]);
    expect(config.functions["app/api/**/route.ts"].regions).toEqual(["sin1"]);
  });
});
