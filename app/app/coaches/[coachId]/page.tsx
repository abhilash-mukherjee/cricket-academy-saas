import { notFound, redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/staff-session";
import { getImpersonationState } from "@/lib/impersonation";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { listBatches } from "@/lib/batches";
import { getCoach } from "@/lib/coaches";
import { calendarDateInIst } from "@/lib/player-age";
import { DashboardBackLink } from "../../dashboard-back-link";
import { deactivatedOwnerPage } from "../../deactivated-owner-page";
import { CoachAttendance } from "../coach-attendance";
import { CoachEditor } from "../coach-editor";

type CoachPageProps = {
  params: Promise<{ coachId: string }>;
};

export default async function CoachPage({ params }: CoachPageProps) {
  const blocked = await deactivatedOwnerPage();
  if (blocked) {
    return blocked;
  }

  const { coachId } = await params;
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

  const coach = await getCoach(academy.id, coachId);
  if (!coach) {
    notFound();
  }

  const academyBatches = await listBatches(academy.id);

  return (
    <main className="flex min-h-full flex-col p-6">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <DashboardBackLink href="/app/coaches" label="Coaches" />
        <section className="card bg-base-200 shadow">
          <div className="card-body gap-4">
            <h1 className="card-title">{coach.name}</h1>
            <CoachEditor coach={coach} />
          </div>
        </section>
        <CoachAttendance
          coachId={coach.id}
          batches={academyBatches.map((batch) => ({
            id: batch.id,
            name: batch.name,
          }))}
          today={calendarDateInIst()}
        />
      </div>
    </main>
  );
}
