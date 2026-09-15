import { and, eq, sql } from "drizzle-orm";
import { academies } from "@/db/domain-schema";
import { getDb } from "@/db/client";

/**
 * If a Super-admin assigned this email as pending Owner, attach the Academy.
 * Returns true when a claim happened.
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
  const [claimed] = await db
    .update(academies)
    .set({
      ownerUserId: userId,
      pendingOwnerEmail: null,
    })
    .where(
      and(
        sql`lower(${academies.pendingOwnerEmail}) = ${normalized}`,
        sql`${academies.ownerUserId} is null`,
      ),
    )
    .returning({ id: academies.id });

  return Boolean(claimed);
}
