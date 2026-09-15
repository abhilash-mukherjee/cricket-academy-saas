import { cache } from "react";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { academies } from "@/db/domain-schema";
import { getDb } from "@/db/client";
import { resolvePublicAssetUrl } from "@/lib/academy-assets";
import { isAcademyIntakeAvailable } from "@/lib/academy-intake";
import { publicAcademyCacheTag } from "@/lib/public-academy-pages";

/** Safety TTL for Conversion HTML if a purge trigger is missed (ADR 0028). */
export const PUBLIC_CONVERSION_CACHE_SECONDS = 300;

export type PublicConversion = {
  name: string;
  slug: string;
  isIntakeAvailable: boolean;
  upiQrUrl: string | null;
};

async function loadPublicConversion(
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

function getCachedPublicConversion(
  slug: string,
): Promise<PublicConversion | null> {
  return unstable_cache(
    () => loadPublicConversion(slug),
    ["public-conversion", slug],
    {
      tags: [publicAcademyCacheTag(slug)],
      revalidate: PUBLIC_CONVERSION_CACHE_SECONDS,
    },
  )();
}

export const getPublicConversion = cache(getCachedPublicConversion);
