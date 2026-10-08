import { describe, expect, it } from "vitest";
import { normalizeOptionalPhone, normalizeRequiredPhone } from "./phone";

const CANONICAL_INDIAN_MOBILE = "+919876543210";

describe("Phone parser", () => {
  it("parses 10-digit Indian mobile, 91 without +, +91, 00, punctuation, and trunk 0 as the same canonical Phone", () => {
    const writings = [
      "9876543210",
      "919876543210",
      "+919876543210",
      "00919876543210",
      "98765 43210",
      "98765-43210",
      "(+91) 98765 43210",
      "09876543210",
    ];

    for (const writing of writings) {
      expect(normalizeRequiredPhone(writing)).toEqual({
        ok: true,
        phone: CANONICAL_INDIAN_MOBILE,
      });
      expect(normalizeOptionalPhone(writing)).toEqual({
        ok: true,
        phone: CANONICAL_INDIAN_MOBILE,
      });
    }
  });

  it("keeps a number that already names another country", () => {
    expect(normalizeRequiredPhone("+971501234567")).toEqual({
      ok: true,
      phone: "+971501234567",
    });
  });

  it("accepts a landline and rejects an extension", () => {
    expect(normalizeRequiredPhone("022 2654 3210")).toEqual({
      ok: true,
      phone: "+912226543210",
    });
    expect(normalizeRequiredPhone("9876543210 ext 2")).toEqual({ ok: false });
    expect(normalizeRequiredPhone("+919876543210 ext 2")).toEqual({
      ok: false,
    });
  });

  it("rejects junk and accepts a well-shaped number without an allocation check", () => {
    expect(normalizeRequiredPhone("98765")).toEqual({ ok: false });
    expect(normalizeRequiredPhone("98abc43210")).toEqual({ ok: false });
    expect(normalizeRequiredPhone("9876543210abc")).toEqual({ ok: false });
    expect(normalizeRequiredPhone("call 9876543210")).toEqual({ ok: false });
    expect(normalizeRequiredPhone("+91")).toEqual({ ok: false });
    expect(normalizeRequiredPhone("9999999999")).toEqual({
      ok: true,
      phone: "+919999999999",
    });
  });

  it("allows an empty Academy phone", () => {
    expect(normalizeOptionalPhone("")).toEqual({ ok: true, phone: null });
    expect(normalizeOptionalPhone("   ")).toEqual({ ok: true, phone: null });
    expect(normalizeOptionalPhone(null)).toEqual({ ok: true, phone: null });
    expect(normalizeRequiredPhone("")).toEqual({ ok: false });
  });
});
