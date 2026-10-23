import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("sitemap route segment config", () => {
  it("revalidates hourly so active Academies are not frozen at build forever", () => {
    const source = readFileSync(path.join(__dirname, "sitemap.ts"), "utf8");

    expect(source).toContain("export const revalidate = 3600");
  });
});
