import { describe, expect, it } from "vitest";
import {
  INSTAGRAM_INVALID_COPY,
  instagramProfileUrl,
  normalizeOptionalInstagram,
  parseInstagramHandle,
} from "./instagram";

describe("Instagram parser", () => {
  it("parses bare handles, @-prefixed handles, and profile URLs while preserving letter casing", () => {
    expect(parseInstagramHandle("elite_cricket")).toBe("elite_cricket");
    expect(parseInstagramHandle("  @elite_cricket  ")).toBe("elite_cricket");
    expect(parseInstagramHandle("https://www.instagram.com/elite_cricket")).toBe(
      "elite_cricket",
    );
    expect(parseInstagramHandle("https://instagram.com/elite_cricket/")).toBe(
      "elite_cricket",
    );
    expect(
      parseInstagramHandle("https://m.instagram.com/elite_cricket?igsh=123"),
    ).toBe("elite_cricket");
    expect(parseInstagramHandle("http://instagram.com/@elite_cricket")).toBe(
      "elite_cricket",
    );
    expect(parseInstagramHandle("instagram.com/Elite.Cricket_99")).toBe(
      "Elite.Cricket_99",
    );
    expect(parseInstagramHandle("www.instagram.com/elite_cricket")).toBe(
      "elite_cricket",
    );
    expect(parseInstagramHandle("m.instagram.com/Elite.Cricket_99/")).toBe(
      "Elite.Cricket_99",
    );
  });

  it("enforces 1-30 allowed characters and rejects invalid handles and non-profile URLs", () => {
    expect(parseInstagramHandle("a")).toBe("a");
    expect(parseInstagramHandle("a".repeat(30))).toBe("a".repeat(30));
    expect(parseInstagramHandle("a".repeat(31))).toBeNull();

    const invalidInputs = [
      "",
      "   ",
      "@",
      "@@elite",
      "elite-cricket",
      "elite cricket",
      "elite/cricket",
      "https://www.instagram.com/",
      "https://www.instagram.com/p/ABC123/",
      "https://www.instagram.com/reel/ABC123/",
      "https://www.instagram.com/reels/ABC123/",
      "https://www.instagram.com/stories/elite_cricket/123/",
      "https://www.instagram.com/explore/",
      "https://www.instagram.com/tv/ABC123/",
      "https://www.instagram.com/accounts/login/",
      "https://www.instagram.com/elite_cricket/p/123",
      "https://www.instagram.com/elite_cricket/reel/123",
      "https://example.com/elite_cricket",
      "https://notinstagram.com/elite_cricket",
      "instagram.com",
      "instagram.com/",
      "ftp://instagram.com/elite_cricket",
    ];

    for (const input of invalidInputs) {
      expect(parseInstagramHandle(input)).toBeNull();
    }
  });

  it("normalizes optional Instagram inputs and constructs canonical profile URLs", () => {
    expect(normalizeOptionalInstagram("")).toEqual({
      ok: true,
      instagramHandle: null,
    });
    expect(normalizeOptionalInstagram("   ")).toEqual({
      ok: true,
      instagramHandle: null,
    });
    expect(normalizeOptionalInstagram(null)).toEqual({
      ok: true,
      instagramHandle: null,
    });
    expect(normalizeOptionalInstagram(undefined)).toEqual({
      ok: true,
      instagramHandle: null,
    });
    expect(
      normalizeOptionalInstagram("https://instagram.com/@Elite_Cricket/"),
    ).toEqual({
      ok: true,
      instagramHandle: "Elite_Cricket",
    });
    expect(
      normalizeOptionalInstagram("https://www.instagram.com/reel/ABC123/"),
    ).toEqual({
      ok: false,
    });

    expect(instagramProfileUrl("elite_cricket")).toBe(
      "https://www.instagram.com/elite_cricket",
    );
    expect(INSTAGRAM_INVALID_COPY).toBe(
      "Enter a valid Instagram handle or profile URL.",
    );
  });
});
