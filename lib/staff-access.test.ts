import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { academies } from "@/db/domain-schema";
import { user } from "@/db/auth-schema";
import { getDb } from "@/db/client";
import { resolveStaffAccess } from "@/lib/staff-access";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ownerEmail = `owner-claim-${suffix}@example.com`;
const ownedSlug = `owned-academy-${suffix}`;
const pendingSlug = `pending-academy-${suffix}`;

describe.skipIf(!hasDatabase)("resolveStaffAccess", () => {
  afterEach(async () => {
    const db = getDb();
    for (const slug of [ownedSlug, pendingSlug]) {
      const [row] = await db
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.slug, slug))
        .limit(1);
      if (row) {
        await db.delete(academies).where(eq(academies.id, row.id));
      }
    }
    await db.delete(user).where(eq(user.email, ownerEmail));
  });

  it("does not throw when an Owner already has an Academy and a pending assignment uses the same email", async () => {
    const db = getDb();
    const userId = crypto.randomUUID();

    await db.insert(user).values({
      id: userId,
      name: "Existing Owner",
      email: ownerEmail,
      emailVerified: true,
    });
    await db.insert(academies).values({
      name: "Owned Academy",
      slug: ownedSlug,
      ownerUserId: userId,
    });
    await db.insert(academies).values({
      name: "Pending Academy",
      slug: pendingSlug,
      pendingOwnerEmail: ownerEmail,
      ownerUserId: null,
    });

    const access = await resolveStaffAccess({
      id: userId,
      email: ownerEmail,
      isSuperAdmin: false,
    });

    expect(access).toMatchObject({
      kind: "owner",
      academy: { slug: ownedSlug },
    });

    const [pending] = await db
      .select({
        ownerUserId: academies.ownerUserId,
        pendingOwnerEmail: academies.pendingOwnerEmail,
      })
      .from(academies)
      .where(eq(academies.slug, pendingSlug))
      .limit(1);
    expect(pending).toEqual({
      ownerUserId: null,
      pendingOwnerEmail: ownerEmail,
    });
  });
});
