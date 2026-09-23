import { and, count, eq } from "drizzle-orm";
import {
  academies,
  batchFeeOptions,
  batches,
  registrations,
} from "@/db/domain-schema";
import { getDb } from "@/db/client";
import { parseRegistrationInput } from "@/lib/registration-input";

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

function postgresConstraint(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  if ("constraint" in error && typeof error.constraint === "string") {
    return error.constraint;
  }

  if (
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "constraint" in error.cause &&
    typeof error.cause.constraint === "string"
  ) {
    return error.cause.constraint;
  }

  if ("message" in error && typeof error.message === "string") {
    const match = error.message.match(/constraint "([^"]+)"/);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}
