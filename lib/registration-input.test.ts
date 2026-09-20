import { describe, expect, it } from "vitest";
import { parseRegistrationInput } from "./registration-input";

describe("parseRegistrationInput", () => {
  it("accepts an adult Player with optional email and note", () => {
    const result = parseRegistrationInput({
      batchFeeOptionId: "11111111-1111-4111-8111-111111111111",
      playerFullName: "Arjun Rao",
      playerDateOfBirth: "1990-06-15",
      playerPhone: "+919876543210",
      contactEmail: "arjun@example.com",
      note: "  Evening preferred.  ",
    });
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        playerFullName: "Arjun Rao",
        contactPhone: "+919876543210",
        contactEmail: "arjun@example.com",
        note: "Evening preferred.",
        guardianFullName: null,
        playerPhone: "+919876543210",
      }),
    });
  });
});
