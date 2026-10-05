import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { batchFeeOptions, batches, players } from "@/db/domain-schema";
import { getTransactionalDb } from "@/db/client";
import { lastCoveredDay } from "@/lib/enrollment-term";
import { guardNewEnrollment, insertEnrollment } from "@/lib/enrollments";
import {
  calendarDateInIst,
  isFutureDateOfBirth,
  isPlayerUnder18,
  isValidCalendarDate,
} from "@/lib/player-age";
import { findOrCreatePlayer } from "@/lib/players";
import {
  DOB_FUTURE_COPY,
  DOB_MISSING_COPY,
  EMAIL_INVALID_COPY,
  GUARDIAN_NAME_COPY,
  PACKAGE_REQUIRED_COPY,
  PLAYER_NAME_COPY,
} from "@/lib/registration-input";
import { normalizeRequiredPhone, PHONE_INVALID_COPY } from "@/lib/phone";
import {
  logWarning,
  logInfo,
  type TraceAttributes,
} from "@/lib/request-trace";

export type ManualAddError =
  | "invalid-input"
  | "not-found"
  | "term-not-covering-today"
  | "overlaps"
  | "paused";

export type ManualAddResult =
  | { ok: true; playerId: string }
  | { ok: false; error: ManualAddError };

class ManualAddFailure extends Error {
  constructor(readonly code: ManualAddError) {
    super(code);
  }
}

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

const optionalPhone = optionalTrimmed.transform((value, ctx) => {
  if (value === null) {
    return null;
  }
  const parsed = normalizeRequiredPhone(value);
  if (!parsed.ok) {
    ctx.addIssue({
      code: "custom",
      message: PHONE_INVALID_COPY,
    });
    return z.NEVER;
  }
  return parsed.phone;
});

const optionalEmail = optionalTrimmed.refine((value) => {
  if (value === null) {
    return true;
  }
  return value.length <= 254 && z.email().safeParse(value).success;
}, EMAIL_INVALID_COPY);

const enrollExistingSchema = z.object({
  playerId: z.uuid(),
  batchId: z.uuid(),
  batchFeeOptionId: z.uuid({ error: PACKAGE_REQUIRED_COPY }),
  validFrom: z.iso.date(),
});

const createOrLinkSchema = z
  .object({
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
    batchId: z.uuid(),
    batchFeeOptionId: z.uuid({ error: PACKAGE_REQUIRED_COPY }),
    validFrom: z.iso.date(),
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

type EnrollExistingInput = z.infer<typeof enrollExistingSchema>;
type CreateOrLinkInput = z.infer<typeof createOrLinkSchema> & {
  contactPhone: string;
  guardianFullName: string | null;
  guardianPhone: string | null;
};

function parseBody(
  input: unknown,
):
  | { mode: "existing"; value: EnrollExistingInput }
  | { mode: "create"; value: CreateOrLinkInput }
  | null {
  if (
    typeof input === "object" &&
    input !== null &&
    "playerId" in input &&
    (input as { playerId?: unknown }).playerId
  ) {
    const parsed = enrollExistingSchema.safeParse(input);
    if (!parsed.success || !isValidCalendarDate(parsed.data.validFrom)) {
      return null;
    }
    return { mode: "existing", value: parsed.data };
  }

  const parsed = createOrLinkSchema.safeParse(input);
  if (!parsed.success || !isValidCalendarDate(parsed.data.validFrom)) {
    return null;
  }

  const under18 = isPlayerUnder18(parsed.data.playerDateOfBirth);
  const contactPhone = under18
    ? parsed.data.guardianPhone
    : parsed.data.playerPhone;
  if (!contactPhone) {
    return null;
  }

  return {
    mode: "create",
    value: {
      ...parsed.data,
      contactPhone,
      guardianFullName: under18 ? parsed.data.guardianFullName : null,
      guardianPhone: under18 ? parsed.data.guardianPhone : null,
    },
  };
}

function playerFields(
  parsed: NonNullable<ReturnType<typeof parseBody>>,
): TraceAttributes | undefined {
  if (parsed.mode !== "create") {
    return undefined;
  }
  return {
    name: parsed.value.playerFullName,
    phone: parsed.value.contactPhone,
    email: parsed.value.contactEmail,
    dateOfBirth: parsed.value.playerDateOfBirth,
  };
}

function playerNotAdded(parsed: ReturnType<typeof parseBody>): string {
  if (parsed?.mode === "existing") {
    return `Player was not added with ID: ${parsed.value.playerId}.`;
  }
  return "Player was not added.";
}

export async function manualAddPlayer(
  academyId: string,
  input: unknown,
  today: string = calendarDateInIst(),
): Promise<ManualAddResult> {
  const parsed = parseBody(input);
  if (!parsed) {
    logWarning("Player was not added.", "invalid-input");
    return { ok: false, error: "invalid-input" };
  }
  if (parsed.value.validFrom > today) {
    logWarning(playerNotAdded(parsed), "invalid-input", playerFields(parsed));
    return { ok: false, error: "invalid-input" };
  }

  const validFrom = parsed.value.validFrom;
  const batchId = parsed.value.batchId;
  const batchFeeOptionId = parsed.value.batchFeeOptionId;
  const db = getTransactionalDb();

  try {
    const playerId = await db.transaction(async (tx) => {
      const [feeOption] = await tx
        .select({
          id: batchFeeOptions.id,
          batchId: batchFeeOptions.batchId,
          daysPerWeek: batchFeeOptions.daysPerWeek,
          termDays: batchFeeOptions.termDays,
          feePaise: batchFeeOptions.feePaise,
        })
        .from(batchFeeOptions)
        .where(
          and(
            eq(batchFeeOptions.id, batchFeeOptionId),
            eq(batchFeeOptions.academyId, academyId),
          ),
        )
        .limit(1);

      if (!feeOption || feeOption.batchId !== batchId) {
        throw new ManualAddFailure("not-found");
      }

      const [batch] = await tx
        .select({ id: batches.id })
        .from(batches)
        .where(and(eq(batches.id, batchId), eq(batches.academyId, academyId)))
        .limit(1);
      if (!batch) {
        throw new ManualAddFailure("not-found");
      }

      const validUntil = lastCoveredDay(validFrom, feeOption.termDays);
      if (validUntil < today) {
        throw new ManualAddFailure("term-not-covering-today");
      }

      let resolvedPlayerId: string;
      if (parsed.mode === "existing") {
        const [player] = await tx
          .select({ id: players.id })
          .from(players)
          .where(
            and(
              eq(players.id, parsed.value.playerId),
              eq(players.academyId, academyId),
            ),
          )
          .limit(1);
        if (!player) {
          throw new ManualAddFailure("not-found");
        }
        resolvedPlayerId = player.id;
      } else {
        const [existingPlayer] = await tx
          .select({ id: players.id })
          .from(players)
          .where(
            and(
              eq(players.academyId, academyId),
              eq(
                players.fullNameNormalized,
                parsed.value.playerFullName.toLowerCase(),
              ),
              eq(players.phone, parsed.value.contactPhone),
            ),
          )
          .limit(1);

        if (existingPlayer) {
          const block = await guardNewEnrollment(tx, {
            academyId,
            playerId: existingPlayer.id,
            batchId,
            validFrom,
            validUntil,
            today,
          });
          if (block) {
            throw new ManualAddFailure(block);
          }
        }

        resolvedPlayerId = await findOrCreatePlayer(tx, academyId, {
          fullName: parsed.value.playerFullName,
          fullNameNormalized: parsed.value.playerFullName.toLowerCase(),
          phone: parsed.value.contactPhone,
          dateOfBirth: parsed.value.playerDateOfBirth,
          guardianFullName: parsed.value.guardianFullName,
          guardianPhone: parsed.value.guardianPhone,
          email: parsed.value.contactEmail,
        });

        if (resolvedPlayerId !== existingPlayer?.id) {
          const block = await guardNewEnrollment(tx, {
            academyId,
            playerId: resolvedPlayerId,
            batchId,
            validFrom,
            validUntil,
            today,
          });
          if (block) {
            throw new ManualAddFailure(block);
          }
        }
      }

      if (parsed.mode === "existing") {
        const block = await guardNewEnrollment(tx, {
          academyId,
          playerId: resolvedPlayerId,
          batchId,
          validFrom,
          validUntil,
          today,
        });
        if (block) {
          throw new ManualAddFailure(block);
        }
      }

      await insertEnrollment(tx, {
        academyId,
        playerId: resolvedPlayerId,
        batchId,
        registrationId: null,
        daysPerWeek: feeOption.daysPerWeek,
        termDays: feeOption.termDays,
        feePaisePaid: feeOption.feePaise,
        validFrom,
        validUntil,
      });

      return resolvedPlayerId;
    });

    logInfo(`Player added successfully with ID: ${playerId}.`, playerFields(parsed));
    return { ok: true, playerId };
  } catch (error) {
    if (error instanceof ManualAddFailure) {
      logWarning(playerNotAdded(parsed), error.code, playerFields(parsed));
      return { ok: false, error: error.code };
    }
    throw error;
  }
}
