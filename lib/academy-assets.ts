import { del, put } from "@vercel/blob";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_ACADEMY_IMAGE_BYTES,
  MAX_BROCHURE_GALLERY_IMAGES,
} from "@/lib/constants";

export type AcademyAssetPurpose =
  | "brochure-gallery"
  | "coach-photo"
  | "upi-qr";

export type AcademyAssetUploadError =
  | "invalid-input"
  | "invalid-type"
  | "file-too-large"
  | "gallery-limit";

export type AcademyAssetUploadResult =
  | { ok: true; storageKey: string; url: string }
  | { ok: false; error: AcademyAssetUploadError };

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function academyAssetPrefix(academyId: string): string {
  return `academies/${academyId}/`;
}

export function isAcademyScopedStorageKey(
  storageKey: string,
  academyId: string,
): boolean {
  return storageKey.startsWith(academyAssetPrefix(academyId));
}

export function isLegacyHttpStorageKey(storageKey: string): boolean {
  return storageKey.startsWith("http://") || storageKey.startsWith("https://");
}

export function resolvePublicAssetUrl(
  storageKey: string | null | undefined,
): string | null {
  if (!storageKey || isLegacyHttpStorageKey(storageKey)) {
    return null;
  }

  const base = process.env.BLOB_PUBLIC_BASE_URL;
  if (!base) {
    return null;
  }

  return `${base.replace(/\/$/, "")}/${storageKey}`;
}

export function isAllowedImageMimeType(mimeType: string): boolean {
  return ALLOWED_IMAGE_MIME_TYPES.includes(
    mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
  );
}

export function extensionForMimeType(mimeType: string): string | null {
  return MIME_TO_EXTENSION[mimeType] ?? null;
}

function pathnameForPurpose(
  academyId: string,
  purpose: AcademyAssetPurpose,
  extension: string,
): string {
  const id = crypto.randomUUID();
  if (purpose === "upi-qr") {
    return `${academyAssetPrefix(academyId)}upi-qr.${extension}`;
  }

  const folder =
    purpose === "brochure-gallery" ? "brochure-gallery" : "coach-photos";
  return `${academyAssetPrefix(academyId)}${folder}/${id}.${extension}`;
}

// draftCount is the editor's current gallery size, including images already saved.
export function validateGalleryCount(
  existingCount: number,
  draftCount = 0,
  incomingCount = 1,
): boolean {
  return (
    Math.max(existingCount, draftCount) + incomingCount <=
    MAX_BROCHURE_GALLERY_IMAGES
  );
}

export async function uploadAcademyAsset(
  academyId: string,
  purpose: AcademyAssetPurpose,
  file: File,
  options?: { existingGalleryCount?: number; draftGalleryCount?: number },
): Promise<AcademyAssetUploadResult> {
  const mimeType = file.type;
  const extension = extensionForMimeType(mimeType);

  if (!extension || !isAllowedImageMimeType(mimeType)) {
    return { ok: false, error: "invalid-type" };
  }

  if (file.size > MAX_ACADEMY_IMAGE_BYTES) {
    return { ok: false, error: "file-too-large" };
  }

  if (purpose === "brochure-gallery") {
    const existingCount = options?.existingGalleryCount ?? 0;
    const draftCount = options?.draftGalleryCount ?? 0;
    if (!validateGalleryCount(existingCount, draftCount)) {
      return { ok: false, error: "gallery-limit" };
    }
  }

  const pathname = pathnameForPurpose(academyId, purpose, extension);
  const blob = await put(pathname, file, {
    access: "public",
    addRandomSuffix: purpose !== "upi-qr",
    allowOverwrite: purpose === "upi-qr",
    contentType: mimeType,
  });

  return {
    ok: true,
    storageKey: blob.pathname,
    url: blob.url,
  };
}

export async function deleteAcademyAsset(storageKey: string): Promise<void> {
  if (!storageKey || isLegacyHttpStorageKey(storageKey)) {
    return;
  }

  await del(storageKey);
}

export async function deleteAcademyAssets(storageKeys: string[]): Promise<void> {
  const keys = storageKeys.filter(
    (key) => key && !isLegacyHttpStorageKey(key),
  );
  if (keys.length === 0) {
    return;
  }

  await del(keys);
}
