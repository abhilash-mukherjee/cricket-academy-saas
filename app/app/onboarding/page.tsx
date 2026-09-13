import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/staff-session";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const session = await requireStaffSession();
  if (session.user.isSuperAdmin) {
    redirect("/app");
  }

  const academy = await getOwnedAcademy(session.user.id);
  if (academy) {
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
