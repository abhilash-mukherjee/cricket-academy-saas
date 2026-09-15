import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { academies, impersonationAuditEvents } from "@/db/domain-schema";
import { user } from "@/db/auth-schema";
import { getDb } from "@/db/client";

export const IMPERSONATION_COOKIE = "staff_impersonation";

export type ImpersonationState = {
  academyId: string;
  subjectUserId: string;
  subjectEmail: string;
  academy: typeof academies.$inferSelect;
};

type StaffSession = {
  user: {
    id: string;
    email: string;
    isSuperAdmin?: boolean | null;
  };
};

function parseCookieValue(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { academyId?: string };
    return typeof parsed.academyId === "string" ? parsed.academyId : null;
  } catch {
    return null;
  }
}

export async function getImpersonationState(
  session: StaffSession,
): Promise<ImpersonationState | null> {
  if (!session.user.isSuperAdmin) {
    return null;
  }

  const jar = await cookies();
  const academyId = parseCookieValue(jar.get(IMPERSONATION_COOKIE)?.value);
  if (!academyId) {
    return null;
  }

  const db = getDb();
  const [row] = await db
    .select({
      academy: academies,
      subjectEmail: user.email,
      subjectUserId: user.id,
    })
    .from(academies)
    .innerJoin(user, eq(academies.ownerUserId, user.id))
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!row) {
    return null;
  }

  if (!row.academy.isActive) {
    const jar = await cookies();
    jar.delete(IMPERSONATION_COOKIE);
    return null;
  }

  return {
    academyId: row.academy.id,
    subjectUserId: row.subjectUserId,
    subjectEmail: row.subjectEmail,
    academy: row.academy,
  };
}

export async function startImpersonation(
  session: StaffSession,
  academyId: string,
): Promise<
  | { ok: true }
  | { ok: false; error: "forbidden" | "not-found" | "no-owner" | "inactive" }
> {
  if (!session.user.isSuperAdmin) {
    return { ok: false, error: "forbidden" };
  }

  const db = getDb();
  const [row] = await db
    .select({
      id: academies.id,
      ownerUserId: academies.ownerUserId,
      isActive: academies.isActive,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!row) {
    return { ok: false, error: "not-found" };
  }
  if (!row.ownerUserId) {
    return { ok: false, error: "no-owner" };
  }
  if (!row.isActive) {
    return { ok: false, error: "inactive" };
  }

  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE, JSON.stringify({ academyId: row.id }));
  return { ok: true };
}

export async function endImpersonation(): Promise<void> {
  const jar = await cookies();
  jar.delete(IMPERSONATION_COOKIE);
}

export async function logImpersonationAction(input: {
  actorUserId: string;
  subjectUserId: string;
  academyId: string;
  action: string;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const db = getDb();
  await db.insert(impersonationAuditEvents).values({
    actorUserId: input.actorUserId,
    subjectUserId: input.subjectUserId,
    academyId: input.academyId,
    action: input.action,
    metadata: input.metadata ?? null,
  });
}
