import { z } from "zod";
import {
  isFutureDateOfBirth,
  isPlayerUnder18,
  isValidCalendarDate,
} from "@/lib/player-age";
import { normalizeRequiredPhone, PHONE_INVALID_COPY } from "@/lib/phone";

export const PLAYER_NAME_COPY = "Enter the Player full name.";
export const GUARDIAN_NAME_COPY = "Enter the Guardian full name.";
export const DOB_MISSING_COPY = "Enter the date of birth.";
export const DOB_FUTURE_COPY = "Date of birth cannot be in the future.";
export const PACKAGE_REQUIRED_COPY = "Choose a package.";
export const EMAIL_INVALID_COPY = "Email must be a valid email address.";

export type ParsedRegistrationInput = {
  batchFeeOptionId: string;
  batchId: string | undefined;
  playerFullName: string;
  playerDateOfBirth: string;
  guardianFullName: string | null;
  guardianPhone: string | null;
  playerPhone: string | null;
  contactPhone: string;
  contactEmail: string | null;
  note: string | null;
};

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const optionalTrimmed = z
  .union([z.string(), z.null()])
  .optional()
  .transform(blankToNull);

const optionalPhone = optionalTrimmed.refine(
  (value) => value === null || normalizeRequiredPhone(value).ok,
  PHONE_INVALID_COPY,
);

const optionalEmail = optionalTrimmed.refine((value) => {
  if (value === null) {
    return true;
  }
  return value.length <= 254 && z.email().safeParse(value).success;
}, EMAIL_INVALID_COPY);

const optionalNote = optionalTrimmed.refine(
  (value) => value === null || value.length <= 500,
);

export const registrationInputSchema = z
  .object({
    batchFeeOptionId: z.uuid({ error: PACKAGE_REQUIRED_COPY }),
    batchId: z.uuid().optional(),
    playerFullName: z
      .string({ error: PLAYER_NAME_COPY })
      .trim()
      .min(1, PLAYER_NAME_COPY)
      .max(200),
    playerDateOfBirth: z.iso.date({ error: DOB_MISSING_COPY }),
    guardianFullName: optionalTrimmed.refine(
      (value) => value === null || value.length <= 200,
      GUARDIAN_NAME_COPY,
    ),
    guardianPhone: optionalPhone,
    playerPhone: optionalPhone,
    contactEmail: optionalEmail,
    note: optionalNote,
  })
  .superRefine((value, ctx) => {
    if (!isValidCalendarDate(value.playerDateOfBirth)) {
      ctx.addIssue({
        code: "custom",
        path: ["playerDateOfBirth"],
        message: DOB_MISSING_COPY,
      });
      return;
    }

    if (isFutureDateOfBirth(value.playerDateOfBirth)) {
      ctx.addIssue({
        code: "custom",
        path: ["playerDateOfBirth"],
        message: DOB_FUTURE_COPY,
      });
      return;
    }

    const under18 = isPlayerUnder18(value.playerDateOfBirth);
    if (under18) {
      if (!value.guardianFullName) {
        ctx.addIssue({
          code: "custom",
          path: ["guardianFullName"],
          message: GUARDIAN_NAME_COPY,
        });
      }
      if (!value.guardianPhone) {
        ctx.addIssue({
          code: "custom",
          path: ["guardianPhone"],
          message: PHONE_INVALID_COPY,
        });
      }
      if (value.playerPhone) {
        ctx.addIssue({
          code: "custom",
          path: ["playerPhone"],
          message: PHONE_INVALID_COPY,
        });
      }
      return;
    }

    if (!value.playerPhone) {
      ctx.addIssue({
        code: "custom",
        path: ["playerPhone"],
        message: PHONE_INVALID_COPY,
      });
    }
    if (value.guardianFullName || value.guardianPhone) {
      ctx.addIssue({
        code: "custom",
        path: ["guardianPhone"],
        message: PHONE_INVALID_COPY,
      });
    }
  });

export type RegistrationFieldErrors = Partial<
  Record<
    | "batchFeeOptionId"
    | "playerFullName"
    | "playerDateOfBirth"
    | "guardianFullName"
    | "guardianPhone"
    | "playerPhone"
    | "contactEmail"
    | "note",
    string
  >
>;

export function parseRegistrationInput(
  body: unknown,
):
  | { ok: true; value: ParsedRegistrationInput }
  | { ok: false; fields: RegistrationFieldErrors } {
  const parsed = registrationInputSchema.safeParse(body);
  if (!parsed.success) {
    const fields: RegistrationFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !(key in fields)) {
        fields[key as keyof RegistrationFieldErrors] = issue.message;
      }
    }
    if (typeof body === "object" && body !== null) {
      const optionId = (body as { batchFeeOptionId?: unknown })
        .batchFeeOptionId;
      if (
        (optionId == null || optionId === "") &&
        !fields.batchFeeOptionId
      ) {
        fields.batchFeeOptionId = PACKAGE_REQUIRED_COPY;
      }
    }
    return { ok: false, fields };
  }

  const under18 = isPlayerUnder18(parsed.data.playerDateOfBirth);
  const contactPhone = under18
    ? parsed.data.guardianPhone
    : parsed.data.playerPhone;
  if (!contactPhone) {
    return {
      ok: false,
      fields: {
        [under18 ? "guardianPhone" : "playerPhone"]: PHONE_INVALID_COPY,
      },
    };
  }

  return {
    ok: true,
    value: {
      batchFeeOptionId: parsed.data.batchFeeOptionId,
      batchId: parsed.data.batchId,
      playerFullName: parsed.data.playerFullName,
      playerDateOfBirth: parsed.data.playerDateOfBirth,
      guardianFullName: under18 ? parsed.data.guardianFullName : null,
      guardianPhone: under18 ? parsed.data.guardianPhone : null,
      playerPhone: under18 ? null : parsed.data.playerPhone,
      contactPhone,
      contactEmail: parsed.data.contactEmail,
      note: parsed.data.note,
    },
  };
}
