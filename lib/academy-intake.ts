import { and, asc, eq } from "drizzle-orm";
import { batches, batchFeeOptions } from "@/db/domain-schema";
import { getDb } from "@/db/client";

export async function isAcademyIntakeAvailable(options: {
  academyId: string;
  isOnlineRegistrationAllowed: boolean;
}): Promise<boolean> {
  if (!options.isOnlineRegistrationAllowed) {
    return false;
  }

  return academyHasRegistrableBatch(options.academyId);
}

async function academyHasRegistrableBatch(academyId: string): Promise<boolean> {
  const db = getDb();
  const openBatches = await db
    .select({ id: batches.id })
    .from(batches)
    .where(
      and(
        eq(batches.academyId, academyId),
        eq(batches.isOpenForRegistration, true),
      ),
    );

  for (const batch of openBatches) {
    const [feeOption] = await db
      .select({ id: batchFeeOptions.id })
      .from(batchFeeOptions)
      .where(
        and(
          eq(batchFeeOptions.batchId, batch.id),
          eq(batchFeeOptions.isOffered, true),
        ),
      )
      .orderBy(asc(batchFeeOptions.sortOrder))
      .limit(1);

    if (feeOption) {
      return true;
    }
  }

  return false;
}
