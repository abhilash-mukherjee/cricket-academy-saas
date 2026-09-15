import { and, desc, eq, sql } from "drizzle-orm";
import { academies } from "@/db/domain-schema";
import { user } from "@/db/auth-schema";
import { getDb } from "@/db/client";
import { isAcademySlug } from "@/lib/academy-slug";

export type AdminAcademyListItem = {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string | null;
  pendingOwnerEmail: string | null;
  isActive: boolean;
  createdAt: string;
};

export type CreateAdminAcademyInput = {
  name: string;
  slug: string;
  pendingOwnerEmail: string;
};

export type CreateAdminAcademyError =
  | "invalid-input"
  | "invalid-slug"
  | "slug-taken"
  | "super-admin-email"
  | "email-already-owns-academy";

export type CreateAdminAcademyResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; error: CreateAdminAcademyError };

export type SetAcademyActiveError = "not-found";

export type SetAcademyActiveResult =
  | { ok: true; slug: string; isActive: boolean }
  | { ok: false; error: SetAcademyActiveError };

function normalizeEmail(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return null;
  }
  return trimmed;
}

export async function listAdminAcademies(): Promise<AdminAcademyListItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: academies.id,
      name: academies.name,
      slug: academies.slug,
      pendingOwnerEmail: academies.pendingOwnerEmail,
      isActive: academies.isActive,
      createdAt: academies.createdAt,
      ownerEmail: user.email,
    })
    .from(academies)
    .leftJoin(user, eq(academies.ownerUserId, user.id))
    .orderBy(desc(academies.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    ownerEmail: row.ownerEmail ?? null,
    pendingOwnerEmail: row.pendingOwnerEmail,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createAdminAcademy(
  input: CreateAdminAcademyInput,
): Promise<CreateAdminAcademyResult> {
  const name = input.name.trim();
  const slug = input.slug.trim();
  const pendingOwnerEmail = normalizeEmail(input.pendingOwnerEmail);

  if (!name || !slug || !pendingOwnerEmail) {
    return { ok: false, error: "invalid-input" };
  }

  if (!isAcademySlug(slug)) {
    return { ok: false, error: "invalid-slug" };
  }

  const db = getDb();

  const [superAdminUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        sql`lower(${user.email}) = ${pendingOwnerEmail}`,
        eq(user.isSuperAdmin, true),
      ),
    )
    .limit(1);
  if (superAdminUser) {
    return { ok: false, error: "super-admin-email" };
  }

  const [existingOwned] = await db
    .select({ id: academies.id })
    .from(academies)
    .innerJoin(user, eq(academies.ownerUserId, user.id))
    .where(sql`lower(${user.email}) = ${pendingOwnerEmail}`)
    .limit(1);
  if (existingOwned) {
    return { ok: false, error: "email-already-owns-academy" };
  }

  const id = crypto.randomUUID();

  try {
    await db.insert(academies).values({
      id,
      name,
      slug,
      pendingOwnerEmail,
      ownerUserId: null,
      isActive: true,
    });
    return { ok: true, id, slug };
  } catch (error) {
    const constraint = postgresConstraint(error);
    if (constraint === "academies_slug_unique") {
      return { ok: false, error: "slug-taken" };
    }
    throw error;
  }
}

export async function setAcademyActive(
  academyId: string,
  isActive: boolean,
): Promise<SetAcademyActiveResult> {
  const db = getDb();
  const [updated] = await db
    .update(academies)
    .set({ isActive })
    .where(eq(academies.id, academyId))
    .returning({ id: academies.id, slug: academies.slug, isActive: academies.isActive });

  if (!updated) {
    return { ok: false, error: "not-found" };
  }

  return { ok: true, slug: updated.slug, isActive: updated.isActive };
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

  if ("message" in error && typeof error.message === "string") {
    const match = error.message.match(/constraint "([^"]+)"/);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}
