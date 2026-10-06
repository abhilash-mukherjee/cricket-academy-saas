import { describe, expect, it } from "vitest";
import { lastCoveredDay, recordedStart } from "./enrollment-term";

describe("last covered day", () => {
  it("runs a 45-day term accepted on 1 June through 15 July", () => {
    expect(lastCoveredDay("2026-06-01", 45)).toBe("2026-07-15");
  });

  it("covers only valid-from for a 1-day term", () => {
    expect(lastCoveredDay("2026-06-01", 1)).toBe("2026-06-01");
  });
});

describe("recorded start", () => {
  const today = "2026-10-06";

  it("stores today or earlier as valid-from and creates no pause", () => {
    expect(recordedStart("2026-10-01", 30, today)).toEqual({
      ok: true,
      validFrom: "2026-10-01",
      validUntil: "2026-10-30",
      deferred: null,
    });
    expect(recordedStart(today, 30, today)).toEqual({
      ok: true,
      validFrom: today,
      validUntil: "2026-11-04",
      deferred: null,
    });
  });

  it("rejects a term that is already over", () => {
    expect(recordedStart("2026-09-01", 10, today)).toEqual({
      ok: false,
      error: "term-not-covering-today",
    });
  });

  it("records a later start as valid-from today and a pause through the day before", () => {
    expect(recordedStart("2026-10-16", 30, today)).toEqual({
      ok: true,
      validFrom: today,
      validUntil: "2026-11-04",
      deferred: {
        pausedOn: today,
        plannedLastPausedOn: "2026-10-15",
      },
    });
  });

  it("does not cap how far ahead the start may be", () => {
    expect(recordedStart("2028-01-01", 45, today)).toEqual({
      ok: true,
      validFrom: today,
      validUntil: "2026-11-19",
      deferred: {
        pausedOn: today,
        plannedLastPausedOn: "2027-12-31",
      },
    });
  });
});
