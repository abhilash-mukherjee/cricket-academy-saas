import { eq, and, asc } from "drizzle-orm";
import { batches } from "@/db/domain-schema";
import { getDb } from "@/db/client";

export type BatchRecord = {
  id: string;
  name: string;
  isOpenForRegistration: boolean;
};

export type CreateBatchError = "invalid-input" | "name-taken";

export type CreateBatchResult =
  | { ok: true; id: string }
  | { ok: false; error: CreateBatchError };

export type RenameBatchError = "invalid-input" | "name-taken" | "not-found";

export type RenameBatchResult =
  | { ok: true }
  | { ok: false; error: RenameBatchError };

export async function listBatches(academyId: string): Promise<BatchRecord[]> {
  const db = getDb();
  return db
    .select({
      id: batches.id,
      name: batches.name,
      isOpenForRegistration: batches.isOpenForRegistration,
    })
    .from(batches)
    .where(eq(batches.academyId, academyId))
    .orderBy(asc(batches.createdAt));
}

export async function createBatch(
  academyId: string,
  name: string,
): Promise<CreateBatchResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: "invalid-input" };
  }

  const db = getDb();
  try {
    const [created] = await db
      .insert(batches)
      .values({
        academyId,
        name: trimmed,
        isOpenForRegistration: false,
      })
      .returning({ id: batches.id });

    return { ok: true, id: created.id };
  } catch (error) {
    if (postgresConstraint(error) === "batches_academy_id_name_unique") {
      return { ok: false, error: "name-taken" };
    }
    throw error;
  }
}

export async function renameBatch(
  academyId: string,
  batchId: string,
  name: string,
): Promise<RenameBatchResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: "invalid-input" };
  }

  const db = getDb();
  try {
    const updated = await db
      .update(batches)
      .set({ name: trimmed })
      .where(and(eq(batches.id, batchId), eq(batches.academyId, academyId)))
      .returning({ id: batches.id });

    if (updated.length === 0) {
      return { ok: false, error: "not-found" };
    }

    return { ok: true };
  } catch (error) {
    if (postgresConstraint(error) === "batches_academy_id_name_unique") {
      return { ok: false, error: "name-taken" };
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
