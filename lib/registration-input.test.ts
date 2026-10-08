import { describe, expect, it } from "vitest";
import { parseRegistrationInput } from "./registration-input";

const optionId = "11111111-1111-4111-8111-111111111111";

describe("parseRegistrationInput", () => {
  it("accepts an adult Player with optional email and note", () => {
    const result = parseRegistrationInput({
      batchFeeOptionId: optionId,
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

  it("stores Guardian and Player phones as the same canonical Phone for equivalent writings", () => {
    const adult = parseRegistrationInput({
      batchFeeOptionId: optionId,
      playerFullName: "Arjun Rao",
      playerDateOfBirth: "1990-06-15",
      playerPhone: "9876543210",
    });
    expect(adult).toEqual({
      ok: true,
      value: expect.objectContaining({
        playerPhone: "+919876543210",
        contactPhone: "+919876543210",
      }),
    });

    const child = parseRegistrationInput({
      batchFeeOptionId: optionId,
      playerFullName: "Mini Rao",
      playerDateOfBirth: "2015-06-15",
      guardianFullName: "Asha Rao",
      guardianPhone: "09876543210",
    });
    expect(child).toEqual({
      ok: true,
      value: expect.objectContaining({
        guardianPhone: "+919876543210",
        contactPhone: "+919876543210",
        playerPhone: null,
      }),
    });
  });

  it("rejects junk phone with Enter a valid phone number.", () => {
    const result = parseRegistrationInput({
      batchFeeOptionId: optionId,
      playerFullName: "Arjun Rao",
      playerDateOfBirth: "1990-06-15",
      playerPhone: "nope",
    });
    expect(result).toEqual({
      ok: false,
      fields: { playerPhone: "Enter a valid phone number." },
    });
  });
});
