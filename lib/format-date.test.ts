import { describe, expect, it } from "vitest";
import { formatCalendarDate, formatDate, formatDateTime } from "./format-date";

describe("formatCalendarDate", () => {
  it("formats a YYYY-MM-DD day as a written month-first date", () => {
    expect(formatCalendarDate("2001-06-29")).toBe("Jun 29, 2001");
    expect(formatCalendarDate("2015-06-15")).toBe("Jun 15, 2015");
    expect(formatCalendarDate("1990-01-01")).toBe("Jan 1, 1990");
  });
});

describe("formatDate", () => {
  it("shows the Asia/Kolkata calendar day for an instant", () => {
    // 2026-03-14 20:00 UTC is already 15 Mar in IST.
    expect(formatDate("2026-03-14T20:00:00.000Z")).toBe("Mar 15, 2026");
  });
});

describe("formatDateTime", () => {
  it("shows date and time in Asia/Kolkata", () => {
    expect(formatDateTime("2026-03-15T10:30:00.000Z")).toBe(
      "Mar 15, 2026, 4:00 PM",
    );
  });
});
