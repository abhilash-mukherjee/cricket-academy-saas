import { getImpersonationState } from "@/lib/impersonation";
import { resolveStaffAccess } from "@/lib/staff-access";
import { requireStaffSession } from "@/lib/staff-session";
import { AcademyDeactivatedMessage } from "./academy-deactivated-message";

/** Deactivated Owner page body. Null means the caller should render the page. */
export async function deactivatedOwnerPage() {
  const session = await requireStaffSession();
  const impersonation = await getImpersonationState(session);
  if (session.user.isSuperAdmin && !impersonation) {
    return null;
  }
  if (impersonation) {
    return null;
  }

  const access = await resolveStaffAccess({
    id: session.user.id,
    email: session.user.email,
    isSuperAdmin: Boolean(session.user.isSuperAdmin),
  });
  if (access.kind !== "owner-deactivated") {
    return null;
  }

  return <AcademyDeactivatedMessage />;
}
