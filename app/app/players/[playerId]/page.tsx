import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/staff-session";
import { getImpersonationState } from "@/lib/impersonation";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { calendarDateInIst } from "@/lib/player-age";
import { packageFactsCopy } from "@/lib/package-copy";
import { getPlayer, type TermStatus } from "@/lib/players";
import { DashboardBackLink } from "../../dashboard-back-link";

type PlayerPageProps = {
  params: Promise<{ playerId: string }>;
};

function statusLabel(status: TermStatus): string {
  if (status === "active") {
    return "Active";
  }
  if (status === "paused") {
    return "Paused";
  }
  return "Lapsed";
}

function pauseCopy(
  pausedOn: string | null,
  plannedLastPausedOn: string | null,
): string | null {
  if (!pausedOn) {
    return null;
  }
  if (plannedLastPausedOn) {
    return `Paused ${pausedOn}, through ${plannedLastPausedOn}`;
  }
  return `Paused ${pausedOn}, open-ended`;
}

export default async function PlayerPage({ params }: PlayerPageProps) {
  const { playerId } = await params;
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

  const player = await getPlayer(academy.id, playerId, calendarDateInIst());
  if (!player) {
    notFound();
  }

  return (
    <main className="flex min-h-full flex-col p-6">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <DashboardBackLink />
        <section className="card bg-base-200 shadow">
          <div className="card-body gap-4">
            <h1 className="card-title">{player.fullName}</h1>
            <a className="link" href={`tel:${player.phone}`}>
              {player.phone}
            </a>
            <p>{player.dateOfBirth}</p>
            {player.guardianFullName ? (
              <p>Guardian: {player.guardianFullName}</p>
            ) : null}
            <ul className="flex flex-col gap-3">
              {player.enrollments.map((enrollment) => (
                <li key={enrollment.id} className="card bg-base-100">
                  <div className="card-body gap-1 py-3">
                    <Link
                      className="link font-medium"
                      href={`/app/batches/${enrollment.batchId}`}
                    >
                      {enrollment.batchName}
                    </Link>
                    <p>{statusLabel(enrollment.status)}</p>
                    <p>
                      {packageFactsCopy({
                        daysPerWeek: enrollment.daysPerWeek,
                        termDays: enrollment.termDays,
                        feePaise: enrollment.feePaisePaid,
                      })}
                    </p>
                    <p>Valid from {enrollment.validFrom}</p>
                    <p>Valid until {enrollment.effectiveValidUntil}</p>
                    {enrollment.status === "paused" ? (
                      <p>
                        {pauseCopy(
                          enrollment.pausedOn,
                          enrollment.plannedLastPausedOn,
                        )}
                      </p>
                    ) : null}
                    {enrollment.continuesPreviousTerm ? (
                      <p>This term continues the previous one.</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
