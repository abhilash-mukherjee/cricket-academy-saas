import { cache } from "react";
import { eq, asc } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import {
  academies,
  batches,
  brochureImages,
  coachProfiles,
  youtubeEmbeds,
} from "@/db/domain-schema";
import { getDb } from "@/db/client";
import { resolvePublicAssetUrl } from "@/lib/academy-assets";
import {
  type AcademyThemeAccent,
  type AcademyThemeMode,
  resolveAboutLabel,
  resolveAcademyThemeAccent,
  resolveAcademyThemeMode,
} from "@/lib/academy-theme";
import { brochureUrl } from "@/lib/public-origin";
import { listRegistrableBatchIds } from "@/lib/academy-intake";
import { publicAcademyCacheTag } from "@/lib/public-academy-pages";

export type PublicBrochureBatch = {
  id: string;
  name: string;
  blurb: string | null;
  isRegistrable: boolean;
};

export type PublicBrochure = {
  name: string;
  slug: string;
  tagline: string | null;
  aboutLabel: string;
  about: string | null;
  logoUrl: string | null;
  themeMode: AcademyThemeMode;
  themeAccent: AcademyThemeAccent;
  location: string | null;
  phone: string | null;
  instagramHandle: string | null;
  whatsapp: string | null;
  isIntakeAvailable: boolean;
  images: { url: string }[];
  youtubeVideoIds: string[];
  batches: PublicBrochureBatch[];
  coaches: {
    fullName: string;
    imageUrl: string | null;
    blurb: string | null;
  }[];
};

async function loadPublicBrochure(
  slug: string,
): Promise<PublicBrochure | null> {
  const db = getDb();
  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      slug: academies.slug,
      tagline: academies.tagline,
      aboutLabel: academies.aboutLabel,
      about: academies.about,
      logoStorageKey: academies.logoStorageKey,
      themeMode: academies.themeMode,
      themeAccent: academies.themeAccent,
      location: academies.location,
      phone: academies.phone,
      instagramHandle: academies.instagramHandle,
      whatsapp: academies.whatsapp,
      isActive: academies.isActive,
      isOnlineRegistrationAllowed: academies.isOnlineRegistrationAllowed,
    })
    .from(academies)
    .where(eq(academies.slug, slug))
    .limit(1);

  if (!academy || !academy.isActive) {
    return null;
  }

  const [images, embeds, academyBatches, coaches, registrableBatchIds] =
    await Promise.all([
      db
        .select({ storageKey: brochureImages.storageKey })
        .from(brochureImages)
        .where(eq(brochureImages.academyId, academy.id))
        .orderBy(asc(brochureImages.sortOrder)),
      db
        .select({ videoId: youtubeEmbeds.videoId })
        .from(youtubeEmbeds)
        .where(eq(youtubeEmbeds.academyId, academy.id))
        .orderBy(asc(youtubeEmbeds.sortOrder)),
      db
        .select({ id: batches.id, name: batches.name, blurb: batches.blurb })
        .from(batches)
        .where(eq(batches.academyId, academy.id))
        .orderBy(asc(batches.createdAt)),
      db
        .select({
          fullName: coachProfiles.fullName,
          storageKey: coachProfiles.storageKey,
          blurb: coachProfiles.blurb,
        })
        .from(coachProfiles)
        .where(eq(coachProfiles.academyId, academy.id))
        .orderBy(asc(coachProfiles.sortOrder)),
      listRegistrableBatchIds({
        academyId: academy.id,
        isOnlineRegistrationAllowed: academy.isOnlineRegistrationAllowed,
      }),
    ]);

  return {
    name: academy.name,
    slug: academy.slug,
    tagline: academy.tagline,
    aboutLabel: resolveAboutLabel(academy.aboutLabel),
    about: academy.about,
    logoUrl: resolvePublicAssetUrl(academy.logoStorageKey),
    themeMode: resolveAcademyThemeMode(academy.themeMode),
    themeAccent: resolveAcademyThemeAccent(academy.themeAccent),
    location: academy.location,
    phone: academy.phone,
    instagramHandle: academy.instagramHandle,
    whatsapp: academy.whatsapp,
    isIntakeAvailable: registrableBatchIds.size > 0,
    images: images
      .map((image) => resolvePublicAssetUrl(image.storageKey))
      .filter((url): url is string => Boolean(url))
      .map((url) => ({ url })),
    youtubeVideoIds: embeds.map((embed) => embed.videoId),
    batches: academyBatches.map((batch) => ({
      id: batch.id,
      name: batch.name,
      blurb: batch.blurb,
      isRegistrable: registrableBatchIds.has(batch.id),
    })),
    coaches: coaches.map((coach) => ({
      fullName: coach.fullName,
      imageUrl: resolvePublicAssetUrl(coach.storageKey),
      blurb: coach.blurb,
    })),
  };
}

async function getCachedPublicBrochure(
  slug: string,
): Promise<PublicBrochure | null> {
  const cached = await unstable_cache(
    () => loadPublicBrochure(slug),
    [
      "public-brochure",
      slug,
      "appearance-v1",
      "batch-registration-v1",
      "social-v1",
    ],
    {
      tags: [publicAcademyCacheTag(slug)],
      revalidate: false,
    },
  )();
  if (!cached) {
    return null;
  }

  return {
    ...cached,
    aboutLabel: resolveAboutLabel(cached.aboutLabel),
    about: cached.about ?? null,
    logoUrl: cached.logoUrl ?? null,
    instagramHandle: cached.instagramHandle ?? null,
    whatsapp: cached.whatsapp ?? null,
    themeMode: resolveAcademyThemeMode(cached.themeMode),
    themeAccent: resolveAcademyThemeAccent(cached.themeAccent),
    batches: cached.batches.map((batch) => ({
      ...batch,
      isRegistrable: Boolean(batch.isRegistrable),
    })),
  };
}

export const getPublicBrochure = cache(getCachedPublicBrochure);

export async function listActiveBrochureUrls(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ slug: academies.slug })
    .from(academies)
    .where(eq(academies.isActive, true));

  return rows.map((row) => brochureUrl(row.slug));
}
