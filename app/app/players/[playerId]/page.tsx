import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireStaffSession } from "@/lib/staff-session";
import { getImpersonationState } from "@/lib/impersonation";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { listBatches } from "@/lib/batches";
import { listFeeOptions } from "@/lib/batch-fee-options";
import { formatCalendarDate } from "@/lib/format-date";
import { calendarDateInIst } from "@/lib/player-age";
import { packageFactsCopy } from "@/lib/package-copy";
import { getPlayer, type TermStatus } from "@/lib/players";
import { PlayerPageBackLink } from "../../player-page-back-link";
import { ManualAddForm } from "../manual-add-form";

type PlayerPageProps = {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ fromBatch?: string | string[] }>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function backHref(fromBatch: string): string {
  const parsed = z.uuid().safeParse(fromBatch);
  if (!parsed.success) {
    return "/app/players";
  }
  return `/app/batches/${parsed.data}`;
}

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
    return `Paused ${formatCalendarDate(pausedOn)}, through ${formatCalendarDate(plannedLastPausedOn)}`;
  }
  return `Paused ${formatCalendarDate(pausedOn)}, open-ended`;
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

  const canManualAdd = Boolean(impersonation || !session.user.isSuperAdmin);

  return (
    <main className="flex min-h-full flex-col p-6">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <PlayerPageBackLink href={backHref(firstParam(query.fromBatch))} />
        <section className="card bg-base-200 shadow">
          <div className="card-body gap-4">
            <h1 className="card-title">{player.fullName}</h1>
            {canManualAdd ? (
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
                    <p>Valid from {formatCalendarDate(enrollment.validFrom)}</p>
                    <p>
                      Valid until{" "}
                      {formatCalendarDate(enrollment.effectiveValidUntil)}
                    </p>
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
