import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/staff-session";
import { getImpersonationState } from "@/lib/impersonation";
import { resolveStaffAccess } from "@/lib/staff-access";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const session = await requireStaffSession();
  const impersonation = await getImpersonationState(session);

  if (session.user.isSuperAdmin || impersonation) {
    redirect(impersonation ? "/app/dashboard" : "/app/admin/academies");
  }

  const access = await resolveStaffAccess({
    id: session.user.id,
    email: session.user.email,
    isSuperAdmin: false,
  });

  if (access.kind !== "needs-onboarding") {
    redirect("/app/dashboard");
  }

  return (
    <main className="flex min-h-full flex-col p-6">
      <section className="card bg-base-200 mx-auto w-full max-w-lg shadow">
        <div className="card-body gap-4">
          <h1 className="card-title">Set up your Academy</h1>
          <p className="text-base-content/70 text-sm">
            One login owns one Academy. Complete these steps to get a public
            brochure URL.
          </p>
          <OnboardingWizard />
        </div>
      </section>
    </main>
  );
}
