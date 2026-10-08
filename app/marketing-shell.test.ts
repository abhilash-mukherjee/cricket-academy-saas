import { statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HERO_BUDGET_BYTES = 250 * 1024;

describe("product homepage hero", () => {
  it("fits a mobile-friendly byte budget so LCP is not a multi-megabyte download", () => {
    const bytes = statSync(
      path.join(__dirname, "../public/product-homepage-hero.webp"),
    ).size;

    expect(bytes).toBeLessThan(HERO_BUDGET_BYTES);
  });
});
