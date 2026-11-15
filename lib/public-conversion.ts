import { cache } from "react";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { academies } from "@/db/domain-schema";
import { getDb } from "@/db/client";
import { resolvePublicAssetUrl } from "@/lib/academy-assets";
import {
  type AcademyThemeAccent,
  type AcademyThemeMode,
  resolveAcademyThemeAccent,
  resolveAcademyThemeMode,
} from "@/lib/academy-theme";
import { listRegistrableBatches, type RegistrableBatch } from "@/lib/academy-intake";
import { publicAcademyCacheTag } from "@/lib/public-academy-pages";

/**
 * Safety TTL for Conversion HTML if a purge trigger is missed (ADR 0028).
 * The Conversion page `export const revalidate` must use this same numeric literal;
 * Next.js cannot statically analyze an imported binding.
 */
export const PUBLIC_CONVERSION_CACHE_SECONDS = 300;

export type PublicConversion = {
  name: string;
  slug: string;
  phone: string | null;
  logoUrl: string | null;
  themeMode: AcademyThemeMode;
  themeAccent: AcademyThemeAccent;
  isOnlineRegistrationAllowed: boolean;
  isIntakeAvailable: boolean;
  upiQrUrl: string | null;
  batches: RegistrableBatch[];
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
      phone: academies.phone,
      logoStorageKey: academies.logoStorageKey,
      themeMode: academies.themeMode,
      themeAccent: academies.themeAccent,
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

  const batches = academy.isOnlineRegistrationAllowed
    ? await listRegistrableBatches(academy.id)
    : [];
  const isIntakeAvailable = batches.length > 0;

  return {
    name: academy.name,
    slug: academy.slug,
    phone: academy.phone,
    logoUrl: resolvePublicAssetUrl(academy.logoStorageKey),
    themeMode: resolveAcademyThemeMode(academy.themeMode),
    themeAccent: resolveAcademyThemeAccent(academy.themeAccent),
    isOnlineRegistrationAllowed: academy.isOnlineRegistrationAllowed,
    isIntakeAvailable,
    upiQrUrl: isIntakeAvailable
      ? resolvePublicAssetUrl(academy.upiQrStorageKey)
      : null,
    batches,
  };
}

async function getCachedPublicConversion(
  slug: string,
): Promise<PublicConversion | null> {
  const cached = await unstable_cache(
    () => loadPublicConversion(slug),
    ["public-conversion", slug, "registrable-ids", "appearance-v1"],
    {
      tags: [publicAcademyCacheTag(slug)],
      revalidate: PUBLIC_CONVERSION_CACHE_SECONDS,
    },
  )();
  if (!cached) {
    return null;
  }

  return {
    ...cached,
    logoUrl: cached.logoUrl ?? null,
    themeMode: resolveAcademyThemeMode(cached.themeMode),
    themeAccent: resolveAcademyThemeAccent(cached.themeAccent),
  };
}

export const getPublicConversion = cache(getCachedPublicConversion);
