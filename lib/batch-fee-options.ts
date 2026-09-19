import { and, asc, desc, eq } from "drizzle-orm";
import { batchFeeOptions, batches, registrations } from "@/db/domain-schema";
import { getDb } from "@/db/client";

export type FeeOptionRecord = {
  id: string;
  batchId: string;
  daysPerWeek: number;
  termMonths: number;
  feePaise: number;
  label: string | null;
  isOffered: boolean;
  sortOrder: number;
};

export type CreateFeeOptionError = "invalid-input" | "identity-taken" | "not-found";

export type CreateFeeOptionResult =
  | { ok: true; id: string }
  | { ok: false; error: CreateFeeOptionError };

export type CreateFeeOptionInput = {
  daysPerWeek: number;
  termMonths: number;
  feeInr: number;
  label?: string | null;
};

export type UpdateFeeOptionError = "invalid-input" | "not-found";

export type UpdateFeeOptionResult =
  | { ok: true }
  | { ok: false; error: UpdateFeeOptionError };

export type UpdateFeeOptionInput = {
  feeInr?: number;
  label?: string | null;
  sortOrder?: number;
  isOffered?: boolean;
};

export type DeleteFeeOptionError = "not-found" | "in-use";

export type DeleteFeeOptionResult =
  | { ok: true }
  | { ok: false; error: DeleteFeeOptionError };

export async function listFeeOptions(
  academyId: string,
): Promise<FeeOptionRecord[]> {
  const db = getDb();
  return db
    .select({
      id: batchFeeOptions.id,
      batchId: batchFeeOptions.batchId,
      daysPerWeek: batchFeeOptions.daysPerWeek,
      termMonths: batchFeeOptions.termMonths,
      feePaise: batchFeeOptions.feePaise,
      label: batchFeeOptions.label,
      isOffered: batchFeeOptions.isOffered,
      sortOrder: batchFeeOptions.sortOrder,
    })
    .from(batchFeeOptions)
    .where(eq(batchFeeOptions.academyId, academyId))
    .orderBy(asc(batchFeeOptions.sortOrder), asc(batchFeeOptions.createdAt));
}

export async function createFeeOption(
  academyId: string,
  batchId: string,
  input: CreateFeeOptionInput,
): Promise<CreateFeeOptionResult> {
  const daysPerWeek = input.daysPerWeek;
  const termMonths = input.termMonths;
  const feePaise = inrToPaise(input.feeInr);
  const label = normalizeLabel(input.label);

  if (
    !Number.isInteger(daysPerWeek) ||
    daysPerWeek < 1 ||
    daysPerWeek > 7 ||
    !Number.isInteger(termMonths) ||
    termMonths < 1 ||
    feePaise === null
  ) {
    return { ok: false, error: "invalid-input" };
  }

  const db = getDb();
  const [batch] = await db
    .select({ id: batches.id })
    .from(batches)
    .where(and(eq(batches.id, batchId), eq(batches.academyId, academyId)))
    .limit(1);

  if (!batch) {
    return { ok: false, error: "not-found" };
  }

  const [last] = await db
    .select({ sortOrder: batchFeeOptions.sortOrder })
    .from(batchFeeOptions)
    .where(
      and(
        eq(batchFeeOptions.academyId, academyId),
        eq(batchFeeOptions.batchId, batchId),
      ),
    )
    .orderBy(desc(batchFeeOptions.sortOrder))
    .limit(1);

  try {
    const [created] = await db
      .insert(batchFeeOptions)
      .values({
        academyId,
        batchId,
        daysPerWeek,
        termMonths,
        feePaise,
        label,
        isOffered: true,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      })
      .returning({ id: batchFeeOptions.id });

    return { ok: true, id: created.id };
  } catch (error) {
    if (
      postgresConstraint(error) ===
      "batch_fee_options_batch_id_days_per_week_term_months_unique"
    ) {
      return { ok: false, error: "identity-taken" };
    }
    throw error;
  }
}

export async function updateFeeOption(
  academyId: string,
  batchId: string,
  feeOptionId: string,
  input: UpdateFeeOptionInput,
): Promise<UpdateFeeOptionResult> {
  const patch: {
    feePaise?: number;
    label?: string | null;
    sortOrder?: number;
    isOffered?: boolean;
  } = {};

  if (input.feeInr !== undefined) {
    const feePaise = inrToPaise(input.feeInr);
    if (feePaise === null) {
      return { ok: false, error: "invalid-input" };
    }
    patch.feePaise = feePaise;
  }

  if (input.label !== undefined) {
    patch.label = normalizeLabel(input.label);
  }

  if (input.sortOrder !== undefined) {
    if (!Number.isInteger(input.sortOrder)) {
      return { ok: false, error: "invalid-input" };
    }
    patch.sortOrder = input.sortOrder;
  }

  if (input.isOffered !== undefined) {
    if (typeof input.isOffered !== "boolean") {
      return { ok: false, error: "invalid-input" };
    }
    patch.isOffered = input.isOffered;
  }

  const db = getDb();
  const where = and(
    eq(batchFeeOptions.id, feeOptionId),
    eq(batchFeeOptions.academyId, academyId),
    eq(batchFeeOptions.batchId, batchId),
  );

  if (Object.keys(patch).length === 0) {
    const [existing] = await db
      .select({ id: batchFeeOptions.id })
      .from(batchFeeOptions)
      .where(where)
      .limit(1);
    return existing ? { ok: true } : { ok: false, error: "not-found" };
  }

  const updated = await db
    .update(batchFeeOptions)
    .set(patch)
    .where(where)
    .returning({ id: batchFeeOptions.id });

  if (updated.length === 0) {
    return { ok: false, error: "not-found" };
  }

  return { ok: true };
}

export async function deleteFeeOption(
  academyId: string,
  batchId: string,
  feeOptionId: string,
): Promise<DeleteFeeOptionResult> {
  const db = getDb();
  const where = and(
    eq(batchFeeOptions.id, feeOptionId),
    eq(batchFeeOptions.academyId, academyId),
    eq(batchFeeOptions.batchId, batchId),
  );

  const [existing] = await db
    .select({ id: batchFeeOptions.id })
    .from(batchFeeOptions)
    .where(where)
    .limit(1);

  if (!existing) {
    return { ok: false, error: "not-found" };
  }

  const [referenced] = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(
      and(
        eq(registrations.batchFeeOptionId, feeOptionId),
        eq(registrations.academyId, academyId),
      ),
    )
    .limit(1);

  if (referenced) {
    return { ok: false, error: "in-use" };
  }

  try {
    await db.delete(batchFeeOptions).where(where);
    return { ok: true };
  } catch (error) {
    if (
      postgresConstraint(error) ===
      "registrations_batch_fee_option_id_batch_fee_options_id_fk"
    ) {
      return { ok: false, error: "in-use" };
    }
    throw error;
  }
}

function inrToPaise(feeInr: number): number | null {
  if (!Number.isInteger(feeInr) || feeInr <= 0) {
    return null;
  }
  return feeInr * 100;
}

function normalizeLabel(label: string | null | undefined): string | null {
  if (label == null) {
    return null;
  }
  const trimmed = String(label).trim();
  return trimmed === "" ? null : trimmed;
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
