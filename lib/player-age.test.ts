import { describe, expect, it } from "vitest";
import { isFutureDateOfBirth, isPlayerUnder18 } from "./player-age";

describe("Player age 18 in Asia/Kolkata", () => {
  const dateOfBirth = "2008-03-15";

  it("is still under 18 just before midnight IST on the 18th birthday", () => {
    expect(
      isPlayerUnder18(dateOfBirth, new Date("2026-03-14T18:29:59.000Z")),
    ).toBe(true);
  });

  it("is 18 at midnight IST on the 18th birthday", () => {
    expect(
      isPlayerUnder18(dateOfBirth, new Date("2026-03-14T18:30:00.000Z")),
    ).toBe(false);
  });

  it("treats the Player as 18 when UTC is still the previous calendar day", () => {
    expect(
      isPlayerUnder18(dateOfBirth, new Date("2026-03-14T20:00:00.000Z")),
    ).toBe(false);
  });

  it("rejects a date of birth that is still in the future in IST", () => {
    expect(
      isFutureDateOfBirth("2026-03-15", new Date("2026-03-14T18:29:59.000Z")),
    ).toBe(true);
    expect(
      isFutureDateOfBirth("2026-03-15", new Date("2026-03-14T18:30:00.000Z")),
    ).toBe(false);
  });
});
