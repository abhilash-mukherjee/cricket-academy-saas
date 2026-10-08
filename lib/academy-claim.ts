import { sql } from "drizzle-orm";
import { academies } from "@/db/domain-schema";
import { getDb } from "@/db/client";

/**
 * If a Super-admin assigned this email as pending Owner, attach the Academy.
 * Returns true when a claim happened.
 * One login owns one Academy: skip (and do not throw) when this user already owns one.
 */
export async function claimPendingAcademy(
  userId: string,
  email: string,
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const db = getDb();
  try {
    const [claimed] = await db
      .update(academies)
      .set({
        ownerUserId: userId,
        pendingOwnerEmail: null,
      })
      .where(
        sql`${academies.id} = (
          SELECT ${academies.id}
          FROM ${academies}
          WHERE lower(${academies.pendingOwnerEmail}) = ${normalized}
            AND ${academies.ownerUserId} IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM ${academies} AS already_owned
              WHERE already_owned.owner_user_id = ${userId}
            )
          LIMIT 1
        )`,
      )
      .returning({ id: academies.id });

    return Boolean(claimed);
  } catch (error) {
    if (postgresConstraint(error) === "academies_owner_user_id_unique") {
      return false;
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
