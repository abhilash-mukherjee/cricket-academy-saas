import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/staff-session";
import { getImpersonationState } from "@/lib/impersonation";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { getBrochureEditor } from "@/lib/brochure";
import { BrochureEditor } from "./brochure-editor";
import { DashboardBackLink } from "../dashboard-back-link";

export default async function BrochureEditorPage() {
  const session = await requireStaffSession();
  const impersonation = await getImpersonationState(session);

  if (session.user.isSuperAdmin && !impersonation) {
    redirect("/app/admin/academies");
  }

  const academy =
    impersonation?.academy ?? (await getOwnedAcademy(session.user.id));
  if (!academy) {
    redirect("/app/onboarding");
  }

  const brochure = await getBrochureEditor(academy.id);
  if (!brochure) {
    redirect("/app/onboarding");
  }

  return (
    <main className="flex min-h-full flex-col p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <DashboardBackLink />
        <section className="card bg-base-200 shadow">
          <div className="card-body gap-4">
            <h1 className="card-title">Brochure</h1>
            <p className="text-base-content/70 text-sm">
              These slots fill the public Academy page. Layout stays the same
              for every Academy.
            </p>
            <BrochureEditor brochure={brochure} />
          </div>
        </section>
      </div>
    </main>
  );
}
