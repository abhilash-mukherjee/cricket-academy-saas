import { eq, asc, and } from "drizzle-orm";
import {
  academies,
  batches,
  batchFeeOptions,
} from "@/db/domain-schema";
import { getDb } from "@/db/client";
import { resolvePublicAssetUrl } from "@/lib/academy-assets";

export type PublicConversion = {
  name: string;
  slug: string;
  isIntakeAvailable: boolean;
  upiQrUrl: string | null;
};

export async function getPublicConversion(
  slug: string,
): Promise<PublicConversion | null> {
  const db = getDb();
  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      slug: academies.slug,
      isActive: academies.isActive,
      isOnlineRegistrationAllowed: academies.isOnlineRegistrationAllowed,
      upiQrStorageKey: academies.upiQrStorageKey,
    })
    .from(academies)
    .where(eq(academies.slug, slug))
    .limit(1);

  if (!academy || !academy.isActive) {
    return null;
  }

  const openBatches = await db
    .select({ id: batches.id })
    .from(batches)
    .where(
      and(
        eq(batches.academyId, academy.id),
        eq(batches.isOpenForRegistration, true),
      ),
    );

  let hasRegistrableBatch = false;
  for (const batch of openBatches) {
    const [feeOption] = await db
      .select({ id: batchFeeOptions.id })
      .from(batchFeeOptions)
      .where(eq(batchFeeOptions.batchId, batch.id))
      .orderBy(asc(batchFeeOptions.sortOrder))
      .limit(1);

    if (feeOption) {
      hasRegistrableBatch = true;
      break;
    }
  }

  const isIntakeAvailable =
    academy.isOnlineRegistrationAllowed && hasRegistrableBatch;

  return {
    name: academy.name,
    slug: academy.slug,
    isIntakeAvailable,
    upiQrUrl: isIntakeAvailable
      ? resolvePublicAssetUrl(academy.upiQrStorageKey)
      : null,
  };
}
