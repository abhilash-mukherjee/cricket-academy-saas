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

/**
 * Resolve staff access after claiming any pending Academy assignment.
 * Super-admin (not impersonating) is platform console access.
 */
export async function resolveStaffAccess(
  staffUser: StaffUser,
): Promise<StaffAccess> {
  if (staffUser.isSuperAdmin) {
    return { kind: "super-admin" };
  }

  await claimPendingAcademy(staffUser.id, staffUser.email);

  const academy = await getOwnedAcademy(staffUser.id);
  if (!academy) {
    return { kind: "needs-onboarding" };
  }

  if (!academy.isActive) {
    return { kind: "owner-deactivated", academy };
  }

  return { kind: "owner", academy };
}
