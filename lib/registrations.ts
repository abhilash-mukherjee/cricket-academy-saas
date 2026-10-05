import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  academies,
  batchFeeOptions,
  batches,
  players,
  registrations,
} from "@/db/domain-schema";
import { getDb, getTransactionalDb } from "@/db/client";
import { lastCoveredDay } from "@/lib/enrollment-term";
import { guardNewEnrollment, insertEnrollment } from "@/lib/enrollments";
import { calendarDateInIst, isValidCalendarDate } from "@/lib/player-age";
import { findOrCreatePlayer } from "@/lib/players";
import { postgresConstraint } from "@/lib/postgres-constraint";
import { parseRegistrationInput } from "@/lib/registration-input";
import {
  logWarning,
  logInfo,
} from "@/lib/request-trace";

export type RegistrationSnapshot = {
  batchName: string;
  daysPerWeek: number;
  termDays: number;
  feePaise: number;
  contactPhone: string;
  contactEmail: string | null;
  label: string | null;
};

export type CreateRegistrationError =
  | "invalid-input"
  | "duplicate-pending"
  | "intake-unavailable";

export type CreateRegistrationResult =
  | { ok: true; snapshot: RegistrationSnapshot }
  | { ok: false; error: CreateRegistrationError };

export async function findActiveAcademyIdBySlug(
  slug: string,
): Promise<string | null> {
  const db = getDb();
  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .where(and(eq(academies.slug, slug), eq(academies.isActive, true)))
    .limit(1);

  return academy?.id ?? null;
}

export async function countPendingRegistrations(
  academyId: string,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(registrations)
    .where(
      and(
        eq(registrations.academyId, academyId),
        eq(registrations.status, "pending"),
      ),
    );

  return row?.value ?? 0;
}

export async function createRegistration(
  academyId: string,
  input: unknown,
): Promise<CreateRegistrationResult> {
  const parsed = parseRegistrationInput(input);
  if (!parsed.ok) {
    return { ok: false, error: "invalid-input" };
  }

  const db = getDb();
  const [offered] = await db
    .select({
      feeOptionId: batchFeeOptions.id,
      batchId: batchFeeOptions.batchId,
      daysPerWeek: batchFeeOptions.daysPerWeek,
      termDays: batchFeeOptions.termDays,
      feePaise: batchFeeOptions.feePaise,
      label: batchFeeOptions.label,
      isOffered: batchFeeOptions.isOffered,
      batchName: batches.name,
      isOpenForRegistration: batches.isOpenForRegistration,
      isOnlineRegistrationAllowed: academies.isOnlineRegistrationAllowed,
    })
    .from(batchFeeOptions)
    .innerJoin(batches, eq(batches.id, batchFeeOptions.batchId))
    .innerJoin(academies, eq(academies.id, batchFeeOptions.academyId))
    .where(
      and(
        eq(batchFeeOptions.id, parsed.value.batchFeeOptionId),
        eq(batchFeeOptions.academyId, academyId),
      ),
    )
    .limit(1);

  if (
    parsed.value.batchId &&
    offered &&
    parsed.value.batchId !== offered.batchId
  ) {
    return { ok: false, error: "invalid-input" };
  }

  if (
    !offered ||
    !offered.isOffered ||
    !offered.isOpenForRegistration ||
    !offered.isOnlineRegistrationAllowed
  ) {
    return { ok: false, error: "intake-unavailable" };
  }

  try {
    const [created] = await db
      .insert(registrations)
      .values({
        academyId,
        batchId: offered.batchId,
        batchFeeOptionId: offered.feeOptionId,
        daysPerWeek: offered.daysPerWeek,
        termDays: offered.termDays,
        feePaise: offered.feePaise,
        playerFullName: parsed.value.playerFullName,
        playerFullNameNormalized: parsed.value.playerFullName.toLowerCase(),
        playerDateOfBirth: parsed.value.playerDateOfBirth,
        guardianFullName: parsed.value.guardianFullName,
        guardianPhone: parsed.value.guardianPhone,
        playerPhone: parsed.value.playerPhone,
        contactPhone: parsed.value.contactPhone,
        contactEmail: parsed.value.contactEmail,
        note: parsed.value.note,
        status: "pending",
      })
      .returning({
        daysPerWeek: registrations.daysPerWeek,
        termDays: registrations.termDays,
        feePaise: registrations.feePaise,
        contactPhone: registrations.contactPhone,
        contactEmail: registrations.contactEmail,
      });

    return {
      ok: true,
      snapshot: {
        batchName: offered.batchName,
        daysPerWeek: created.daysPerWeek,
        termDays: created.termDays,
        feePaise: created.feePaise,
        contactPhone: created.contactPhone,
        contactEmail: created.contactEmail,
        label: offered.label,
      },
    };
  } catch (error) {
    if (postgresConstraint(error) === "registrations_pending_duplicate_guard") {
      return { ok: false, error: "duplicate-pending" };
    }
    throw error;
  }
}

export type PendingRegistration = {
  id: string;
  playerFullName: string;
  contactPhone: string;
  batchName: string;
  daysPerWeek: number;
  termDays: number;
  feePaise: number;
  playerDateOfBirth: string;
  guardianFullName: string | null;
  guardianPhone: string | null;
  contactEmail: string | null;
  note: string | null;
  submittedAt: string;
  existingPlayer: {
    fullName: string;
    phone: string;
    dateOfBirth: string;
  } | null;
};

export async function listPendingRegistrations(
  academyId: string,
): Promise<PendingRegistration[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: registrations.id,
      playerFullName: registrations.playerFullName,
      contactPhone: registrations.contactPhone,
      batchName: batches.name,
      daysPerWeek: registrations.daysPerWeek,
      termDays: registrations.termDays,
      feePaise: registrations.feePaise,
      playerDateOfBirth: registrations.playerDateOfBirth,
      guardianFullName: registrations.guardianFullName,
      guardianPhone: registrations.guardianPhone,
      contactEmail: registrations.contactEmail,
      note: registrations.note,
      createdAt: registrations.createdAt,
      existingPlayerName: players.fullName,
      existingPlayerPhone: players.phone,
      existingPlayerDob: players.dateOfBirth,
    })
    .from(registrations)
    .innerJoin(batches, eq(batches.id, registrations.batchId))
    .leftJoin(
      players,
      and(
        eq(players.academyId, registrations.academyId),
        eq(players.fullNameNormalized, registrations.playerFullNameNormalized),
        eq(players.phone, registrations.contactPhone),
      ),
    )
    .where(
      and(
        eq(registrations.academyId, academyId),
        eq(registrations.status, "pending"),
      ),
    )
    .orderBy(desc(registrations.createdAt), desc(registrations.id));

  return rows.map((row) => ({
    id: row.id,
    playerFullName: row.playerFullName,
    contactPhone: row.contactPhone,
    batchName: row.batchName,
    daysPerWeek: row.daysPerWeek,
    termDays: row.termDays,
    feePaise: row.feePaise,
    playerDateOfBirth: row.playerDateOfBirth,
    guardianFullName: row.guardianFullName,
    guardianPhone: row.guardianPhone,
    contactEmail: row.contactEmail,
    note: row.note,
    submittedAt: row.createdAt.toISOString(),
    existingPlayer: row.existingPlayerName
      ? {
          fullName: row.existingPlayerName,
          phone: row.existingPlayerPhone!,
          dateOfBirth: row.existingPlayerDob!,
        }
      : null,
  }));
}

export type RegistrationCommandError =
  | "invalid-input"
  | "not-found"
  | "not-pending"
  | "term-not-covering-today"
  | "overlaps"
  | "paused";

const acceptBodySchema = z.object({
  validFrom: z.string(),
});

class RegistrationCommandFailure extends Error {
  constructor(readonly code: RegistrationCommandError) {
    super(code);
  }
}

export async function acceptRegistration(
  academyId: string,
  registrationId: string,
  input: unknown,
  acceptedByUserId: string,
  today: string = calendarDateInIst(),
): Promise<{ ok: true } | { ok: false; error: RegistrationCommandError }> {
  const parsed = acceptBodySchema.safeParse(input);
  if (!parsed.success || !isValidCalendarDate(parsed.data.validFrom)) {
    logWarning(
      `Registration was not accepted with ID: ${registrationId}.`,
      "invalid-input",
    );
    return { ok: false, error: "invalid-input" };
  }
  if (parsed.data.validFrom > today) {
    logWarning(
      `Registration was not accepted with ID: ${registrationId}.`,
      "invalid-input",
    );
    return { ok: false, error: "invalid-input" };
  }

  const validFrom = parsed.data.validFrom;
  const db = getTransactionalDb();

  try {
    await db.transaction(async (tx) => {
      const [registration] = await tx
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.id, registrationId),
            eq(registrations.academyId, academyId),
          ),
        )
        .limit(1);

      if (!registration) {
        throw new RegistrationCommandFailure("not-found");
      }
      if (registration.status !== "pending") {
        throw new RegistrationCommandFailure("not-pending");
      }

      const validUntil = lastCoveredDay(validFrom, registration.termDays);
      if (validUntil < today) {
        throw new RegistrationCommandFailure("term-not-covering-today");
      }

      const [existingPlayer] = await tx
        .select({ id: players.id })
        .from(players)
        .where(
          and(
            eq(players.academyId, academyId),
            eq(
              players.fullNameNormalized,
              registration.playerFullNameNormalized,
            ),
            eq(players.phone, registration.contactPhone),
          ),
        )
        .limit(1);

      if (existingPlayer) {
        const block = await guardNewEnrollment(tx, {
          academyId,
          playerId: existingPlayer.id,
          batchId: registration.batchId,
          validFrom,
          validUntil,
          today,
        });
        if (block) {
          throw new RegistrationCommandFailure(block);
        }
      }

      const playerId = await findOrCreatePlayer(tx, academyId, {
        fullName: registration.playerFullName,
        fullNameNormalized: registration.playerFullNameNormalized,
        phone: registration.contactPhone,
        dateOfBirth: registration.playerDateOfBirth,
        guardianFullName: registration.guardianFullName,
        guardianPhone: registration.guardianPhone,
        email: registration.contactEmail,
      });

      if (playerId !== existingPlayer?.id) {
        const block = await guardNewEnrollment(tx, {
          academyId,
          playerId,
          batchId: registration.batchId,
          validFrom,
          validUntil,
          today,
        });
        if (block) {
          throw new RegistrationCommandFailure(block);
        }
      }

      await insertEnrollment(tx, {
        academyId,
        playerId,
        batchId: registration.batchId,
        registrationId: registration.id,
        daysPerWeek: registration.daysPerWeek,
        termDays: registration.termDays,
        feePaisePaid: registration.feePaise,
        validFrom,
        validUntil,
      });

      const accepted = await tx
        .update(registrations)
        .set({
          status: "accepted",
          playerId,
          acceptedAt: new Date(),
          acceptedByUserId,
        })
        .where(
          and(
            eq(registrations.id, registrationId),
            eq(registrations.academyId, academyId),
            eq(registrations.status, "pending"),
          ),
        )
        .returning({ id: registrations.id });

      if (accepted.length === 0) {
        throw new RegistrationCommandFailure("not-pending");
      }
    });
  } catch (error) {
    if (error instanceof RegistrationCommandFailure) {
      logWarning(
        `Registration was not accepted with ID: ${registrationId}.`,
        error.code,
      );
      return { ok: false, error: error.code };
    }
    throw error;
  }

  logInfo(
    `Registration accepted successfully with ID: ${registrationId}.`,
  );
  return { ok: true };
}

export async function rejectRegistration(
  academyId: string,
  registrationId: string,
  rejectedByUserId: string,
): Promise<{ ok: true } | { ok: false; error: RegistrationCommandError }> {
  const db = getTransactionalDb();
  const rejected = await db
    .update(registrations)
    .set({
      status: "rejected",
      rejectedAt: new Date(),
      rejectedByUserId,
    })
    .where(
      and(
        eq(registrations.id, registrationId),
        eq(registrations.academyId, academyId),
        eq(registrations.status, "pending"),
      ),
    )
    .returning({ id: registrations.id });

  if (rejected.length > 0) {
    logInfo(
      `Registration rejected successfully with ID: ${registrationId}.`,
    );
    return { ok: true };
  }

  const [row] = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(
      and(
        eq(registrations.id, registrationId),
        eq(registrations.academyId, academyId),
      ),
    )
    .limit(1);

  const error = row ? "not-pending" : "not-found";
  logWarning(
    `Registration was not rejected with ID: ${registrationId}.`,
    error,
  );
  return { ok: false, error };
}

