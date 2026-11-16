import { eq, and, inArray, asc } from "drizzle-orm";
import {
  academies,
  batches,
  brochureImages,
  coachProfiles,
  youtubeEmbeds,
} from "@/db/domain-schema";
import { getDb } from "@/db/client";
import { z } from "zod";
import {
  deleteAcademyAsset,
  deleteAcademyAssets,
  isAcademyScopedStorageKey,
  isLegacyHttpStorageKey,
  resolvePublicAssetUrl,
} from "@/lib/academy-assets";
import {
  academyThemeAccentSchema,
  academyThemeModeSchema,
  resolveAboutLabel,
  resolveAcademyThemeAccent,
  resolveAcademyThemeMode,
  type AcademyThemeAccent,
  type AcademyThemeMode,
} from "@/lib/academy-theme";

export const brochureAppearanceInputSchema = z.object({
  aboutLabel: z.string().nullable().optional(),
  about: z.string().nullable().optional(),
  logoStorageKey: z.string().nullable().optional(),
  themeMode: academyThemeModeSchema.optional(),
  themeAccent: academyThemeAccentSchema.optional(),
});

export const brochureSocialInputSchema = z.object({
  instagram: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(),
});
import { MAX_BROCHURE_GALLERY_IMAGES } from "@/lib/constants";
import {
  instagramProfileUrl,
  normalizeOptionalInstagram,
} from "@/lib/instagram";
import { normalizeOptionalPhone } from "@/lib/phone";
import { parseYoutubeVideoId } from "@/lib/youtube";
import { listRegistrableBatchIds } from "@/lib/academy-intake";
import {
  logWarning,
  logInfo,
} from "@/lib/request-trace";

export type BrochureCoachInput = {
  fullName: string;
  imageStorageKey?: string | null;
  blurb?: string | null;
};

export type BrochureEditInput = {
  name: string;
  tagline?: string | null;
  aboutLabel?: string | null;
  about?: string | null;
  logoStorageKey?: string | null;
  themeMode?: string;
  themeAccent?: string;
  location?: string | null;
  phone?: string | null;
  instagram?: string | null;
  whatsapp?: string | null;
  imageStorageKeys?: string[];
  youtubeUrls?: string[];
  batchBlurbs?: { id: string; blurb: string }[];
  coaches?: BrochureCoachInput[];
};

export type BrochureEditError =
  | "invalid-input"
  | "invalid-phone"
  | "invalid-instagram"
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
  isRegistrable: boolean;
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
  aboutLabel: string;
  about: string | null;
  logoStorageKey: string | null;
  logoUrl: string | null;
  themeMode: AcademyThemeMode;
  themeAccent: AcademyThemeAccent;
  location: string | null;
  phone: string | null;
  instagramUrl: string | null;
  whatsapp: string | null;
  isIntakeAvailable: boolean;
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
): { ok: false; error: "invalid-storage-key" } | null {
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
      aboutLabel: academies.aboutLabel,
      about: academies.about,
      logoStorageKey: academies.logoStorageKey,
      themeMode: academies.themeMode,
      themeAccent: academies.themeAccent,
      location: academies.location,
      phone: academies.phone,
      instagramHandle: academies.instagramHandle,
      whatsapp: academies.whatsapp,
      isOnlineRegistrationAllowed: academies.isOnlineRegistrationAllowed,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    return null;
  }

  const [academyBatches, images, embeds, coaches, registrableBatchIds] =
    await Promise.all([
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
    listRegistrableBatchIds({
      academyId,
      isOnlineRegistrationAllowed: academy.isOnlineRegistrationAllowed,
    }),
  ]);

  const logoStorageKey = normalizeStoredKey(academy.logoStorageKey);

  return {
    name: academy.name,
    slug: academy.slug,
    tagline: academy.tagline,
    aboutLabel: academy.aboutLabel,
    about: academy.about,
    logoStorageKey,
    logoUrl: resolvePublicAssetUrl(logoStorageKey),
    themeMode: resolveAcademyThemeMode(academy.themeMode),
    themeAccent: resolveAcademyThemeAccent(academy.themeAccent),
    location: academy.location,
    phone: academy.phone,
    instagramUrl: academy.instagramHandle
      ? instagramProfileUrl(academy.instagramHandle)
      : null,
    whatsapp: academy.whatsapp,
    isIntakeAvailable: registrableBatchIds.size > 0,
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
    batches: academyBatches.map((batch) => ({
      ...batch,
      isRegistrable: registrableBatchIds.has(batch.id),
    })),
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
    logWarning(
      `Brochure was not updated with ID: ${academyId}.`,
      "invalid-input",
    );
    return { ok: false, error: "invalid-input" };
  }

  const phoneResult = normalizeOptionalPhone(input.phone);
  if (!phoneResult.ok) {
    logWarning(
      `Brochure was not updated with ID: ${academyId}.`,
      "invalid-phone",
      { name, phone: input.phone },
    );
    return { ok: false, error: "invalid-phone" };
  }

  const parsedSocial = brochureSocialInputSchema.safeParse({
    ...(input.instagram !== undefined ? { instagram: input.instagram } : {}),
    ...(input.whatsapp !== undefined ? { whatsapp: input.whatsapp } : {}),
  });
  if (!parsedSocial.success) {
    logWarning(
      `Brochure was not updated with ID: ${academyId}.`,
      "invalid-input",
      { name, phone: phoneResult.phone },
    );
    return { ok: false, error: "invalid-input" };
  }

  let nextWhatsapp: string | null | undefined;
  if (parsedSocial.data.whatsapp !== undefined) {
    const whatsappResult = normalizeOptionalPhone(parsedSocial.data.whatsapp);
    if (!whatsappResult.ok) {
      logWarning(
        `Brochure was not updated with ID: ${academyId}.`,
        "invalid-phone",
        { name, whatsapp: parsedSocial.data.whatsapp },
      );
      return { ok: false, error: "invalid-phone" };
    }
    nextWhatsapp = whatsappResult.phone;
  }

  let nextInstagramHandle: string | null | undefined;
  if (parsedSocial.data.instagram !== undefined) {
    const instagramResult = normalizeOptionalInstagram(
      parsedSocial.data.instagram,
    );
    if (!instagramResult.ok) {
      logWarning(
        `Brochure was not updated with ID: ${academyId}.`,
        "invalid-instagram",
        { name, instagram: parsedSocial.data.instagram },
      );
      return { ok: false, error: "invalid-instagram" };
    }
    nextInstagramHandle = instagramResult.instagramHandle;
  }

  const brochureFields = {
    name,
    phone: phoneResult.phone,
    ...(nextWhatsapp !== undefined ? { whatsapp: nextWhatsapp } : {}),
    ...(nextInstagramHandle !== undefined
      ? { instagramHandle: nextInstagramHandle }
      : {}),
  };
  const brochureNotUpdated = (error: BrochureEditError): BrochureEditResult => {
    logWarning(
      `Brochure was not updated with ID: ${academyId}.`,
      error,
      brochureFields,
    );
    return { ok: false, error };
  };

  const parsedAppearance = brochureAppearanceInputSchema.safeParse({
    ...(input.aboutLabel !== undefined
      ? { aboutLabel: input.aboutLabel }
      : {}),
    ...(input.about !== undefined ? { about: input.about } : {}),
    ...(input.logoStorageKey !== undefined
      ? { logoStorageKey: input.logoStorageKey }
      : {}),
    ...(input.themeMode !== undefined ? { themeMode: input.themeMode } : {}),
    ...(input.themeAccent !== undefined
      ? { themeAccent: input.themeAccent }
      : {}),
  });
  if (!parsedAppearance.success) {
    return brochureNotUpdated("invalid-input");
  }

  let nextLogoKey: string | null | undefined;
  if (input.logoStorageKey !== undefined) {
    nextLogoKey = optionalText(input.logoStorageKey);
    if (nextLogoKey && !isAcademyScopedStorageKey(nextLogoKey, academyId)) {
      return brochureNotUpdated("invalid-storage-key");
    }
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
      return brochureNotUpdated("gallery-limit");
    }

    const keyError = validateStorageKeys(academyId, imageKeys);
    if (keyError) {
      return brochureNotUpdated(keyError.error);
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
        return brochureNotUpdated("invalid-youtube-url");
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
      return brochureNotUpdated(coachKeyError.error);
    }
  }

  const db = getDb();
  const [existingAcademy, existingImages, existingCoaches] = await Promise.all([
    db
      .select({ logoStorageKey: academies.logoStorageKey })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({ storageKey: brochureImages.storageKey })
      .from(brochureImages)
      .where(eq(brochureImages.academyId, academyId)),
    db
      .select({ storageKey: coachProfiles.storageKey })
      .from(coachProfiles)
      .where(eq(coachProfiles.academyId, academyId)),
  ]);

  if (!existingAcademy) {
    return brochureNotUpdated("not-found");
  }

  const academyUpdate: {
    name: string;
    tagline: string | null;
    location: string | null;
    phone: string | null;
    instagramHandle?: string | null;
    whatsapp?: string | null;
    aboutLabel?: string;
    about?: string | null;
    logoStorageKey?: string | null;
    themeMode?: AcademyThemeMode;
    themeAccent?: AcademyThemeAccent;
  } = {
    name,
    tagline: optionalText(input.tagline),
    location: optionalText(input.location),
    phone: phoneResult.phone,
  };
  if (nextInstagramHandle !== undefined) {
    academyUpdate.instagramHandle = nextInstagramHandle;
  }
  if (nextWhatsapp !== undefined) {
    academyUpdate.whatsapp = nextWhatsapp;
  }
  if (parsedAppearance.data.aboutLabel !== undefined) {
    academyUpdate.aboutLabel = resolveAboutLabel(
      optionalText(parsedAppearance.data.aboutLabel),
    );
  }
  if (parsedAppearance.data.about !== undefined) {
    academyUpdate.about = optionalText(parsedAppearance.data.about);
  }
  if (nextLogoKey !== undefined) {
    academyUpdate.logoStorageKey = nextLogoKey;
  }
  if (parsedAppearance.data.themeMode !== undefined) {
    academyUpdate.themeMode = parsedAppearance.data.themeMode;
  }
  if (parsedAppearance.data.themeAccent !== undefined) {
    academyUpdate.themeAccent = parsedAppearance.data.themeAccent;
  }

  const updated = await db
    .update(academies)
    .set(academyUpdate)
    .where(eq(academies.id, academyId))
    .returning({ id: academies.id });

  if (updated.length === 0) {
    return brochureNotUpdated("not-found");
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
        return brochureNotUpdated("invalid-input");
      }
    }

    for (const item of input.batchBlurbs) {
      await db
        .update(batches)
        .set({ blurb: optionalText(item.blurb) })
        .where(and(eq(batches.id, item.id), eq(batches.academyId, academyId)));
    }
  }

  if (
    nextLogoKey !== undefined &&
    existingAcademy.logoStorageKey &&
    existingAcademy.logoStorageKey !== nextLogoKey
  ) {
    await deleteAcademyAsset(existingAcademy.logoStorageKey);
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

  logInfo(`Brochure updated successfully with ID: ${academyId}.`, brochureFields);
  return { ok: true };
}
