import { eq } from "drizzle-orm";
import { academies, batches } from "@/db/domain-schema";
import { user } from "@/db/auth-schema";
import { getDb } from "@/db/client";
import { isAcademySlug } from "@/lib/academy-slug";
import { normalizeOptionalPhone } from "@/lib/phone";

export type OwnerOnboardingInput = {
  displayName: string;
  academyName: string;
  slug: string;
  batchName: string;
  tagline?: string | null;
  location?: string | null;
  phone?: string | null;
};

export type OwnerOnboardingError =
  | "invalid-input"
  | "invalid-slug"
  | "invalid-phone"
  | "slug-taken"
  | "already-owns-academy";

export type OwnerOnboardingResult =
  | { ok: true; slug: string }
  | { ok: false; error: OwnerOnboardingError };

export async function getOwnedAcademy(ownerUserId: string) {
  const db = getDb();
  const [academy] = await db
    .select()
    .from(academies)
    .where(eq(academies.ownerUserId, ownerUserId))
    .limit(1);
  return academy ?? null;
}

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export async function completeOwnerOnboarding(
  ownerUserId: string,
  input: OwnerOnboardingInput,
): Promise<OwnerOnboardingResult> {
  const displayName = input.displayName.trim();
  const academyName = input.academyName.trim();
  const slug = input.slug.trim();
  const batchName = input.batchName.trim();

  if (!displayName || !academyName || !slug || !batchName) {
    return { ok: false, error: "invalid-input" };
  }

  if (!isAcademySlug(slug)) {
    return { ok: false, error: "invalid-slug" };
  }

  const phoneResult = normalizeOptionalPhone(input.phone);
  if (!phoneResult.ok) {
    return { ok: false, error: "invalid-phone" };
  }

  const existing = await getOwnedAcademy(ownerUserId);
  if (existing) {
    return { ok: false, error: "already-owns-academy" };
  }

  const db = getDb();
  const academyId = crypto.randomUUID();

  try {
    await db.batch([
      db
        .update(user)
        .set({ name: displayName })
        .where(eq(user.id, ownerUserId)),
      db.insert(academies).values({
        id: academyId,
        name: academyName,
        slug,
        tagline: optionalText(input.tagline),
        location: optionalText(input.location),
        phone: phoneResult.phone,
        ownerUserId,
      }),
      db.insert(batches).values({
        academyId,
        name: batchName,
        isOpenForRegistration: false,
      }),
    ]);

    return { ok: true, slug };
  } catch (error) {
    const constraint = postgresConstraint(error);
    if (constraint === "academies_slug_unique") {
      return { ok: false, error: "slug-taken" };
    }
    if (constraint === "academies_owner_user_id_unique") {
      return { ok: false, error: "already-owns-academy" };
    }
    throw error;
  }
}

function postgresConstraint(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  if ("constraint" in error && typeof error.constraint === "string") {
    return error.constraint;
  }

  if (
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "constraint" in error.cause &&
    typeof error.cause.constraint === "string"
  ) {
    return error.cause.constraint;
  }

  return undefined;
}
