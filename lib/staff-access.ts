import { cache } from "react";
import { claimPendingAcademy } from "@/lib/academy-claim";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import type { academies } from "@/db/domain-schema";

type Academy = typeof academies.$inferSelect;

export type StaffAccess =
  | { kind: "super-admin" }
  | { kind: "owner"; academy: Academy }
  | { kind: "owner-deactivated"; academy: Academy }
  | { kind: "needs-onboarding" };

type StaffUser = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
};

const loadStaffAccess = cache(
  async (
    id: string,
    email: string,
    isSuperAdmin: boolean,
  ): Promise<StaffAccess> => {
    if (isSuperAdmin) {
      return { kind: "super-admin" };
    }

    await claimPendingAcademy(id, email);

    const academy = await getOwnedAcademy(id);
    if (!academy) {
      return { kind: "needs-onboarding" };
    }

    if (!academy.isActive) {
      return { kind: "owner-deactivated", academy };
    }

    return { kind: "owner", academy };
  },
);

/**
 * Resolve staff access after claiming any pending Academy assignment.
 * Super-admin (not impersonating) is platform console access.
 * Cached per request so the staff chrome and the page share one lookup.
 */
export function resolveStaffAccess(
  staffUser: StaffUser,
): Promise<StaffAccess> {
  return loadStaffAccess(
    staffUser.id,
    staffUser.email,
    staffUser.isSuperAdmin,
  );
}
