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
import { brochureUrl } from "@/lib/public-origin";
import { isAcademyIntakeAvailable } from "@/lib/academy-intake";
import { publicAcademyCacheTag } from "@/lib/public-academy-pages";

export type PublicBrochure = {
  name: string;
  slug: string;
  tagline: string | null;
  location: string | null;
  phone: string | null;
  isIntakeAvailable: boolean;
  images: { url: string }[];
  youtubeVideoIds: string[];
  batches: { name: string; blurb: string | null }[];
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
      location: academies.location,
      phone: academies.phone,
      isActive: academies.isActive,
      isOnlineRegistrationAllowed: academies.isOnlineRegistrationAllowed,
    })
    .from(academies)
    .where(eq(academies.slug, slug))
    .limit(1);

  if (!academy || !academy.isActive) {
    return null;
  }

  const [images, embeds, academyBatches, coaches, isIntakeAvailable] =
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
        .select({ name: batches.name, blurb: batches.blurb })
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
      isAcademyIntakeAvailable({
        academyId: academy.id,
        isOnlineRegistrationAllowed: academy.isOnlineRegistrationAllowed,
      }),
    ]);

  return {
    name: academy.name,
    slug: academy.slug,
    tagline: academy.tagline,
    location: academy.location,
    phone: academy.phone,
    isIntakeAvailable,
    images: images
      .map((image) => resolvePublicAssetUrl(image.storageKey))
      .filter((url): url is string => Boolean(url))
      .map((url) => ({ url })),
    youtubeVideoIds: embeds.map((embed) => embed.videoId),
    batches: academyBatches,
    coaches: coaches.map((coach) => ({
      fullName: coach.fullName,
      imageUrl: resolvePublicAssetUrl(coach.storageKey),
      blurb: coach.blurb,
    })),
  };
}

function getCachedPublicBrochure(slug: string): Promise<PublicBrochure | null> {
  return unstable_cache(
    () => loadPublicBrochure(slug),
    ["public-brochure", slug],
    {
      tags: [publicAcademyCacheTag(slug)],
      revalidate: false,
    },
  )();
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
