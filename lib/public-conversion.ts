import { eq } from "drizzle-orm";
import { academies } from "@/db/domain-schema";
import { getDb } from "@/db/client";
import { resolvePublicAssetUrl } from "@/lib/academy-assets";
import { isAcademyIntakeAvailable } from "@/lib/academy-intake";

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

  const isIntakeAvailable = await isAcademyIntakeAvailable({
    academyId: academy.id,
    isOnlineRegistrationAllowed: academy.isOnlineRegistrationAllowed,
  });

  return {
    name: academy.name,
    slug: academy.slug,
    isIntakeAvailable,
    upiQrUrl: isIntakeAvailable
      ? resolvePublicAssetUrl(academy.upiQrStorageKey)
      : null,
  };
}
