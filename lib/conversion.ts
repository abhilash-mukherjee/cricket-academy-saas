import { eq } from "drizzle-orm";
import { academies } from "@/db/domain-schema";
import { getDb } from "@/db/client";
import {
  deleteAcademyAsset,
  isAcademyScopedStorageKey,
  isLegacyHttpStorageKey,
  resolvePublicAssetUrl,
} from "@/lib/academy-assets";

export type ConversionEditorState = {
  upiQrStorageKey: string | null;
  upiQrUrl: string | null;
};

export type ConversionEditInput = {
  upiQrStorageKey?: string | null;
};

export type ConversionEditError =
  | "invalid-input"
  | "invalid-storage-key"
  | "not-found";

export type ConversionEditResult =
  | { ok: true }
  | { ok: false; error: ConversionEditError };

export async function getConversionEditor(
  academyId: string,
): Promise<ConversionEditorState | null> {
  const db = getDb();
  const [academy] = await db
    .select({ upiQrStorageKey: academies.upiQrStorageKey })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    return null;
  }

  const upiQrStorageKey =
    academy.upiQrStorageKey && !isLegacyHttpStorageKey(academy.upiQrStorageKey)
      ? academy.upiQrStorageKey
      : null;

  return {
    upiQrStorageKey,
    upiQrUrl: resolvePublicAssetUrl(upiQrStorageKey),
  };
}

export async function updateConversion(
  academyId: string,
  input: ConversionEditInput,
): Promise<ConversionEditResult> {
  if (!("upiQrStorageKey" in input)) {
    return { ok: false, error: "invalid-input" };
  }

  const nextKey = input.upiQrStorageKey ?? null;
  if (nextKey && !isAcademyScopedStorageKey(nextKey, academyId)) {
    return { ok: false, error: "invalid-storage-key" };
  }

  const db = getDb();
  const [current] = await db
    .select({ upiQrStorageKey: academies.upiQrStorageKey })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!current) {
    return { ok: false, error: "not-found" };
  }

  const updated = await db
    .update(academies)
    .set({ upiQrStorageKey: nextKey })
    .where(eq(academies.id, academyId))
    .returning({ id: academies.id });

  if (updated.length === 0) {
    return { ok: false, error: "not-found" };
  }

  if (
    current.upiQrStorageKey &&
    current.upiQrStorageKey !== nextKey
  ) {
    await deleteAcademyAsset(current.upiQrStorageKey);
  }

  return { ok: true };
}
