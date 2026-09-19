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
  isOnlineRegistrationAllowed: boolean;
};

export type ConversionEditInput = {
  upiQrStorageKey?: string | null;
  isOnlineRegistrationAllowed?: boolean;
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
    .select({
      upiQrStorageKey: academies.upiQrStorageKey,
      isOnlineRegistrationAllowed: academies.isOnlineRegistrationAllowed,
    })
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
    isOnlineRegistrationAllowed: academy.isOnlineRegistrationAllowed,
  };
}

export async function updateConversion(
  academyId: string,
  input: ConversionEditInput,
): Promise<ConversionEditResult> {
  const hasQr = "upiQrStorageKey" in input;
  const hasOnlineRegistrationAllowed = "isOnlineRegistrationAllowed" in input;

  if (!hasQr && !hasOnlineRegistrationAllowed) {
    return { ok: false, error: "invalid-input" };
  }

  if (
    hasOnlineRegistrationAllowed &&
    typeof input.isOnlineRegistrationAllowed !== "boolean"
  ) {
    return { ok: false, error: "invalid-input" };
  }

  const nextKey = hasQr ? (input.upiQrStorageKey ?? null) : undefined;
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
    .set({
      ...(hasQr ? { upiQrStorageKey: nextKey } : {}),
      ...(hasOnlineRegistrationAllowed
        ? { isOnlineRegistrationAllowed: input.isOnlineRegistrationAllowed }
        : {}),
    })
    .where(eq(academies.id, academyId))
    .returning({ id: academies.id });

  if (updated.length === 0) {
    return { ok: false, error: "not-found" };
  }

  if (
    hasQr &&
    current.upiQrStorageKey &&
    current.upiQrStorageKey !== nextKey
  ) {
    await deleteAcademyAsset(current.upiQrStorageKey);
  }

  return { ok: true };
}
