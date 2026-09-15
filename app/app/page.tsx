import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/staff-session";
import { resolveStaffAccess } from "@/lib/staff-access";
import { getImpersonationState } from "@/lib/impersonation";

export default async function AppHomePage() {
  const session = await requireStaffSession();
  const impersonation = await getImpersonationState(session);

  if (impersonation) {
    redirect("/app/dashboard");
  }

  if (session.user.isSuperAdmin) {
    redirect("/app/admin/academies");
  }

  const access = await resolveStaffAccess({
    id: session.user.id,
    email: session.user.email,
    isSuperAdmin: false,
  });

  if (access.kind === "needs-onboarding") {
    redirect("/app/onboarding");
  }

  redirect("/app/dashboard");
}
