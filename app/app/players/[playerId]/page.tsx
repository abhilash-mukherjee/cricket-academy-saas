import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireStaffSession } from "@/lib/staff-session";
import { getImpersonationState } from "@/lib/impersonation";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { listBatches } from "@/lib/batches";
import { listFeeOptions } from "@/lib/batch-fee-options";
import { formatCalendarDate } from "@/lib/format-date";
import { calendarDateInIst, isValidCalendarDate } from "@/lib/player-age";
import { listBatchSessionDates } from "@/lib/batch-sessions";
import { getPlayer } from "@/lib/players";
import { PlayerPageBackLink } from "../../player-page-back-link";
import { ManualAddForm } from "../manual-add-form";
import { PlayerEnrollmentList } from "../player-enrollment-list";

type PlayerPageProps = {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{
    fromBatch?: string | string[];
    sessionDate?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function backHref(fromBatch: string, sessionDate: string): string {
  const parsed = z.uuid().safeParse(fromBatch);
  if (!parsed.success) {
    return "/app/players";
  }
  if (isValidCalendarDate(sessionDate)) {
    return `/app/batches/${parsed.data}/sessions?date=${sessionDate}`;
  }
  return `/app/batches/${parsed.data}`;
}

export default async function PlayerPage({
  params,
  searchParams,
}: PlayerPageProps) {
  const { playerId } = await params;
  const query = await searchParams;
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

  const today = calendarDateInIst();
  const [player, batches, feeOptions] = await Promise.all([
    getPlayer(academy.id, playerId, today),
    listBatches(academy.id),
    listFeeOptions(academy.id),
  ]);
  if (!player) {
    notFound();
  }

  const sessionDatesByBatch = await listBatchSessionDates(
    academy.id,
    [...new Set(player.enrollments.map((enrollment) => enrollment.batchId))],
  );

  const canMutate = Boolean(impersonation || !session.user.isSuperAdmin);

  return (
    <main className="flex min-h-full flex-col p-6">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <PlayerPageBackLink
          href={backHref(
            firstParam(query.fromBatch),
            firstParam(query.sessionDate),
          )}
        />
        <section className="card bg-base-200 shadow">
          <div className="card-body gap-4">
            <h1 className="card-title">{player.fullName}</h1>
            {canMutate ? (
              <ManualAddForm
                mode="detail"
                playerId={player.id}
                playerName={player.fullName}
                batches={batches}
                feeOptions={feeOptions}
                today={today}
              />
            ) : null}
            <span>
              <span>Phone: </span>
              <a className="link" href={`tel:${player.phone}`}>
                {player.phone}
              </a>
            </span>

            <p>Date Of Birth: {formatCalendarDate(player.dateOfBirth)}</p>
            {player.guardianFullName ? (
              <p>Guardian: {player.guardianFullName}</p>
            ) : null}
            {player.email ? <p>Email: {player.email}</p> : null}
            <PlayerEnrollmentList
              enrollments={player.enrollments}
              today={today}
              canMutate={canMutate}
              sessionDatesByBatch={sessionDatesByBatch}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
