import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/staff-session";
import { getImpersonationState } from "@/lib/impersonation";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { getConversionEditor } from "@/lib/conversion";
import { ConversionEditor } from "./conversion-editor";

export default async function ConversionEditorPage() {
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

  const conversion = await getConversionEditor(academy.id);
  if (!conversion) {
    redirect("/app/onboarding");
  }

  return (
    <main className="flex min-h-full flex-col p-6">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <section className="card bg-base-200 shadow">
          <div className="card-body gap-4">
            <h1 className="card-title">Conversion page</h1>
            <ConversionEditor conversion={conversion} />
          </div>
        </section>
      </div>
    </main>
  );
}
