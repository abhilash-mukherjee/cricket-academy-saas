import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import {
  getImpersonationState,
  logImpersonationAction,
  type ImpersonationState,
} from "@/lib/impersonation";
import { logActor, logException } from "@/lib/request-trace";
import type { academies } from "@/db/domain-schema";

type Academy = typeof academies.$inferSelect;

export type OwnerContext =
  | {
      ok: true;
      academy: Academy;
      actorUserId: string;
      subjectUserId: string;
      impersonation: ImpersonationState | null;
    }
  | { ok: false; error: "unauthorized" | "forbidden" | "not-found" };

/**
 * Resolve the Academy an Owner API/page should operate on.
 * Super-admin may only succeed while impersonating.
 */
export async function resolveOwnerContext(
  requestHeaders?: Headers,
  options?: { recordActor?: boolean },
): Promise<OwnerContext> {
  const session = await auth.api.getSession({
    headers: requestHeaders ?? (await headers()),
  });

  if (!session) {
    return { ok: false, error: "unauthorized" };
  }

  if (options?.recordActor !== false) {
    logActor(session.user.id);
  }

  const impersonation = await getImpersonationState(session);
  if (impersonation) {
    return {
      ok: true,
      academy: impersonation.academy,
      actorUserId: session.user.id,
      subjectUserId: impersonation.subjectUserId,
      impersonation,
    };
  }

  if (session.user.isSuperAdmin) {
    return { ok: false, error: "forbidden" };
  }

  const academy = await getOwnedAcademy(session.user.id);
  if (!academy) {
    return { ok: false, error: "not-found" };
  }

  if (!academy.isActive) {
    return { ok: false, error: "forbidden" };
  }

  return {
    ok: true,
    academy,
    actorUserId: session.user.id,
    subjectUserId: session.user.id,
    impersonation: null,
  };
}

export async function recordOwnerWriteIfImpersonating(
  context: Extract<OwnerContext, { ok: true }>,
  action: string,
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  if (!context.impersonation) {
    return;
  }

  try {
    await logImpersonationAction({
      actorUserId: context.actorUserId,
      subjectUserId: context.subjectUserId,
      academyId: context.academy.id,
      action,
      metadata,
    });
  } catch (error) {
    logException(error);
  }
}
