import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/staff-session";
import { getImpersonationState } from "@/lib/impersonation";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { listBatches } from "@/lib/batches";
import { BatchesEditor } from "./batches-editor";

export default async function BatchesPage() {
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

  const academyBatches = await listBatches(academy.id);

  return (
    <main className="flex min-h-full flex-col p-6">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <section className="card bg-base-200 shadow">
          <div className="card-body gap-4">
            <h1 className="card-title">Batches</h1>
            <p className="text-base-content/70 text-sm">
              Names are unique at this Academy. New Batches start closed for
              Registration. Batch blurbs stay on the brochure editor.
            </p>
            <BatchesEditor batches={academyBatches} />
          </div>
        </section>
      </div>
    </main>
  );
}
