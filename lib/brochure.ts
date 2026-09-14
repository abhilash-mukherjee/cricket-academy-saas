import { eq, and, inArray, asc } from "drizzle-orm";
import {
  academies,
  batches,
  brochureImages,
  coachProfiles,
  youtubeEmbeds,
} from "@/db/domain-schema";
import { getDb } from "@/db/client";
import {
  deleteAcademyAssets,
  isAcademyScopedStorageKey,
  isLegacyHttpStorageKey,
  resolvePublicAssetUrl,
} from "@/lib/academy-assets";
import { MAX_BROCHURE_GALLERY_IMAGES } from "@/lib/constants";
import { normalizeOptionalPhone } from "@/lib/phone";
import { parseYoutubeVideoId } from "@/lib/youtube";

export type BrochureCoachInput = {
  fullName: string;
  imageStorageKey?: string | null;
  blurb?: string | null;
};

export type BrochureEditInput = {
  name: string;
  tagline?: string | null;
  location?: string | null;
  phone?: string | null;
  imageStorageKeys?: string[];
  youtubeUrls?: string[];
  batchBlurbs?: { id: string; blurb: string }[];
  coaches?: BrochureCoachInput[];
};

export type BrochureEditError =
  | "invalid-input"
  | "invalid-phone"
  | "invalid-storage-key"
  | "invalid-youtube-url"
  | "gallery-limit"
  | "not-found";

export type BrochureEditResult =
  | { ok: true }
  | { ok: false; error: BrochureEditError };

export type BrochureEditorBatch = {
  id: string;
  name: string;
  blurb: string | null;
};

export type BrochureEditorImage = {
  storageKey: string;
  url: string | null;
};

export type BrochureEditorCoach = {
  fullName: string;
  imageStorageKey: string | null;
  imageUrl: string | null;
  blurb: string | null;
};

export type BrochureEditorState = {
  name: string;
  slug: string;
  tagline: string | null;
  location: string | null;
  phone: string | null;
  images: BrochureEditorImage[];
  youtubeUrls: string[];
  batches: BrochureEditorBatch[];
  coaches: BrochureEditorCoach[];
};

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function normalizeStoredKey(
  storageKey: string | null | undefined,
): string | null {
  if (!storageKey || isLegacyHttpStorageKey(storageKey)) {
    return null;
  }

  return storageKey;
}

function validateStorageKeys(
  academyId: string,
  keys: string[],
): BrochureEditResult | null {
  for (const key of keys) {
    if (!isAcademyScopedStorageKey(key, academyId)) {
      return { ok: false, error: "invalid-storage-key" };
    }
  }

  return null;
}

export async function countBrochureGalleryImages(
  academyId: string,
): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: brochureImages.id })
    .from(brochureImages)
    .where(eq(brochureImages.academyId, academyId));
  return rows.length;
}

export async function getBrochureEditor(
  academyId: string,
): Promise<BrochureEditorState | null> {
  const db = getDb();
  const [academy] = await db
    .select({
      name: academies.name,
      slug: academies.slug,
      tagline: academies.tagline,
      location: academies.location,
      phone: academies.phone,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    return null;
  }

  const [academyBatches, images, embeds, coaches] = await Promise.all([
    db
      .select({
        id: batches.id,
        name: batches.name,
        blurb: batches.blurb,
      })
      .from(batches)
      .where(eq(batches.academyId, academyId))
      .orderBy(asc(batches.createdAt)),
    db
      .select({ storageKey: brochureImages.storageKey })
      .from(brochureImages)
      .where(eq(brochureImages.academyId, academyId))
      .orderBy(asc(brochureImages.sortOrder)),
    db
      .select({ videoId: youtubeEmbeds.videoId })
      .from(youtubeEmbeds)
      .where(eq(youtubeEmbeds.academyId, academyId))
      .orderBy(asc(youtubeEmbeds.sortOrder)),
    db
      .select({
        fullName: coachProfiles.fullName,
        storageKey: coachProfiles.storageKey,
        blurb: coachProfiles.blurb,
      })
      .from(coachProfiles)
      .where(eq(coachProfiles.academyId, academyId))
      .orderBy(asc(coachProfiles.sortOrder)),
  ]);

  return {
    name: academy.name,
    slug: academy.slug,
    tagline: academy.tagline,
    location: academy.location,
    phone: academy.phone,
    images: images
      .map((image) => normalizeStoredKey(image.storageKey))
      .filter((storageKey): storageKey is string => Boolean(storageKey))
      .map((storageKey) => ({
        storageKey,
        url: resolvePublicAssetUrl(storageKey),
      })),
    youtubeUrls: embeds.map(
      (embed) => `https://www.youtube.com/watch?v=${embed.videoId}`,
    ),
    batches: academyBatches,
    coaches: coaches.map((coach) => {
      const imageStorageKey = normalizeStoredKey(coach.storageKey);
      return {
        fullName: coach.fullName,
        imageStorageKey,
        imageUrl: imageStorageKey
          ? resolvePublicAssetUrl(imageStorageKey)
          : null,
        blurb: coach.blurb,
      };
    }),
  };
}

export async function updateBrochure(
  academyId: string,
  input: BrochureEditInput,
): Promise<BrochureEditResult> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "invalid-input" };
  }

  const phoneResult = normalizeOptionalPhone(input.phone);
  if (!phoneResult.ok) {
    return { ok: false, error: "invalid-phone" };
  }

  let imageKeys: string[] | undefined;
  if (input.imageStorageKeys) {
    imageKeys = [];
    for (const raw of input.imageStorageKeys) {
      const key = raw.trim();
      if (!key) {
        continue;
      }
      imageKeys.push(key);
    }

    if (imageKeys.length > MAX_BROCHURE_GALLERY_IMAGES) {
      return { ok: false, error: "gallery-limit" };
    }

    const keyError = validateStorageKeys(academyId, imageKeys);
    if (keyError) {
      return keyError;
    }
  }

  let videoIds: string[] | undefined;
  if (input.youtubeUrls) {
    videoIds = [];
    for (const raw of input.youtubeUrls) {
      const value = raw.trim();
      if (!value) {
        continue;
      }
      const videoId = parseYoutubeVideoId(value);
      if (!videoId) {
        return { ok: false, error: "invalid-youtube-url" };
      }
      videoIds.push(videoId);
    }
  }

  let coaches: BrochureCoachInput[] | undefined;
  if (input.coaches) {
    coaches = [];
    for (const coach of input.coaches) {
      const fullName = coach.fullName.trim();
      if (!fullName) {
        continue;
      }
      const imageStorageKey = optionalText(coach.imageStorageKey);
      coaches.push({
        fullName,
        imageStorageKey,
        blurb: optionalText(coach.blurb),
      });
    }

    const coachKeyError = validateStorageKeys(
      academyId,
      coaches
        .map((coach) => coach.imageStorageKey)
        .filter((key): key is string => Boolean(key)),
    );
    if (coachKeyError) {
      return coachKeyError;
    }
  }

  const db = getDb();
  const [existingImages, existingCoaches] = await Promise.all([
    db
      .select({ storageKey: brochureImages.storageKey })
      .from(brochureImages)
      .where(eq(brochureImages.academyId, academyId)),
    db
      .select({ storageKey: coachProfiles.storageKey })
      .from(coachProfiles)
      .where(eq(coachProfiles.academyId, academyId)),
  ]);

  const updated = await db
    .update(academies)
    .set({
      name,
      tagline: optionalText(input.tagline),
      location: optionalText(input.location),
      phone: phoneResult.phone,
    })
    .where(eq(academies.id, academyId))
    .returning({ id: academies.id });

  if (updated.length === 0) {
    return { ok: false, error: "not-found" };
  }

  if (input.batchBlurbs) {
    const batchIds = input.batchBlurbs.map((item) => item.id);
    if (batchIds.length > 0) {
      const owned = await db
        .select({ id: batches.id })
        .from(batches)
        .where(
          and(eq(batches.academyId, academyId), inArray(batches.id, batchIds)),
        );
      if (owned.length !== new Set(batchIds).size) {
        return { ok: false, error: "invalid-input" };
      }
    }

    for (const item of input.batchBlurbs) {
      await db
        .update(batches)
        .set({ blurb: optionalText(item.blurb) })
        .where(and(eq(batches.id, item.id), eq(batches.academyId, academyId)));
    }
  }

  if (imageKeys) {
    await db
      .delete(brochureImages)
      .where(eq(brochureImages.academyId, academyId));
    if (imageKeys.length > 0) {
      await db.insert(brochureImages).values(
        imageKeys.map((storageKey, sortOrder) => ({
          academyId,
          storageKey,
          sortOrder,
        })),
      );
    }

    const nextImageSet = new Set(imageKeys);
    const removedImageKeys = existingImages
      .map((image) => image.storageKey)
      .filter((key): key is string => Boolean(key && !nextImageSet.has(key)));
    await deleteAcademyAssets(removedImageKeys);
  }

  if (videoIds) {
    await db
      .delete(youtubeEmbeds)
      .where(eq(youtubeEmbeds.academyId, academyId));
    if (videoIds.length > 0) {
      await db.insert(youtubeEmbeds).values(
        videoIds.map((videoId, sortOrder) => ({
          academyId,
          videoId,
          sortOrder,
        })),
      );
    }
  }

  if (coaches) {
    await db
      .delete(coachProfiles)
      .where(eq(coachProfiles.academyId, academyId));
    if (coaches.length > 0) {
      await db.insert(coachProfiles).values(
        coaches.map((coach, sortOrder) => ({
          academyId,
          fullName: coach.fullName,
          storageKey: coach.imageStorageKey ?? null,
          blurb: coach.blurb ?? null,
          sortOrder,
        })),
      );
    }

    const nextCoachKeys = new Set(
      coaches
        .map((coach) => coach.imageStorageKey)
        .filter((key): key is string => Boolean(key)),
    );
    const removedCoachKeys = existingCoaches
      .map((coach) => coach.storageKey)
      .filter((key): key is string => Boolean(key && !nextCoachKeys.has(key)));
    await deleteAcademyAssets(removedCoachKeys);
  }

  return { ok: true };
}
