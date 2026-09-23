import { describe, expect, it } from "vitest";
import { lastCoveredDay } from "./enrollment-term";

describe("last covered day", () => {
  it("runs a 45-day term accepted on 1 June through 15 July", () => {
    expect(lastCoveredDay("2026-06-01", 45)).toBe("2026-07-15");
  });

  it("covers only valid-from for a 1-day term", () => {
    expect(lastCoveredDay("2026-06-01", 1)).toBe("2026-06-01");
  });
});
