import { eq, and, inArray, asc } from "drizzle-orm";
import {
  academies,
  batches,
  brochureImages,
  coachProfiles,
  youtubeEmbeds,
} from "@/db/domain-schema";
import { getDb } from "@/db/client";
import { normalizeOptionalPhone } from "@/lib/phone";
import { isHttpUrl } from "@/lib/public-origin";
import { parseYoutubeVideoId } from "@/lib/youtube";

export type BrochureCoachInput = {
  fullName: string;
  imageUrl?: string | null;
  blurb?: string | null;
};

export type BrochureEditInput = {
  name: string;
  tagline?: string | null;
  location?: string | null;
  phone?: string | null;
  imageUrls?: string[];
  youtubeUrls?: string[];
  batchBlurbs?: { id: string; blurb: string }[];
  coaches?: BrochureCoachInput[];
};

export type BrochureEditError =
  | "invalid-input"
  | "invalid-phone"
  | "invalid-image-url"
  | "invalid-youtube-url"
  | "not-found";

export type BrochureEditResult =
  | { ok: true }
  | { ok: false; error: BrochureEditError };

export type BrochureEditorBatch = {
  id: string;
  name: string;
  blurb: string | null;
};

export type BrochureEditorState = {
  name: string;
  slug: string;
  tagline: string | null;
  location: string | null;
  phone: string | null;
  imageUrls: string[];
  youtubeUrls: string[];
  batches: BrochureEditorBatch[];
  coaches: BrochureCoachInput[];
};

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
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
    imageUrls: images.map((image) => image.storageKey),
    youtubeUrls: embeds.map(
      (embed) => `https://www.youtube.com/watch?v=${embed.videoId}`,
    ),
    batches: academyBatches,
    coaches: coaches.map((coach) => ({
      fullName: coach.fullName,
      imageUrl: coach.storageKey,
      blurb: coach.blurb,
    })),
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
  if (input.imageUrls) {
    imageKeys = [];
    for (const raw of input.imageUrls) {
      const url = raw.trim();
      if (!url) {
        continue;
      }
      if (!isHttpUrl(url)) {
        return { ok: false, error: "invalid-image-url" };
      }
      imageKeys.push(url);
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
      const imageUrl = optionalText(coach.imageUrl);
      if (imageUrl && !isHttpUrl(imageUrl)) {
        return { ok: false, error: "invalid-image-url" };
      }
      coaches.push({
        fullName,
        imageUrl,
        blurb: optionalText(coach.blurb),
      });
    }
  }

  const db = getDb();
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
          storageKey: coach.imageUrl ?? null,
          blurb: coach.blurb ?? null,
          sortOrder,
        })),
      );
    }
  }

  return { ok: true };
}
