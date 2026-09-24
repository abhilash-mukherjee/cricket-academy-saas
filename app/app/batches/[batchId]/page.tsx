import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/staff-session";
import { getImpersonationState } from "@/lib/impersonation";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { calendarDateInIst } from "@/lib/player-age";
import { listBatches } from "@/lib/batches";
import { listFeeOptions } from "@/lib/batch-fee-options";
import { listBatchRoster } from "@/lib/players";
import { DashboardBackLink } from "../../dashboard-back-link";
import { PlayerPager } from "../../players/player-pager";
import { BatchEditor } from "../batch-editor";

type BatchRosterPageProps = {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function requestedPage(value: string): number {
  if (!/^\d+$/.test(value)) {
    return 1;
  }
  const page = Number(value);
  return page >= 1 ? page : 1;
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

export default async function BatchRosterPage({
  params,
  searchParams,
}: BatchRosterPageProps) {
  const { batchId } = await params;
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

  const [roster, academyBatches, feeOptions] = await Promise.all([
    listBatchRoster(academy.id, batchId, {
      page: requestedPage(firstParam(query.page)),
      today: calendarDateInIst(),
    }),
    listBatches(academy.id),
    listFeeOptions(academy.id),
  ]);
  const batch = academyBatches.find((item) => item.id === batchId);
  if (!roster || !batch) {
    notFound();
  }

  return (
    <main className="flex min-h-full flex-col p-6">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <DashboardBackLink href="/app/batches" label="Batches" />
        <section className="card bg-base-200 shadow">
          <div className="card-body gap-4">
            <h1 className="card-title">{roster.batchName}</h1>
            <BatchEditor
              batch={batch}
              feeOptions={feeOptions.filter(
                (option) => option.batchId === batchId,
              )}
            />
            <h2 className="text-lg font-medium">Roster</h2>
            {roster.players.length === 0 ? (
              <p>No Players on this Batch.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {roster.players.map((player) => (
                  <li key={player.id} className="card bg-base-100 relative">
                    <div className="card-body gap-1 py-3">
                      <Link
                        className="link font-medium after:absolute after:inset-0"
                        href={`/app/players/${player.id}`}
                      >
                        {player.fullName}
                      </Link>
                      <a className="link relative z-10" href={`tel:${player.phone}`}>
                        {player.phone}
                      </a>
                      <p>
                        {player.status === "active" ? "Active" : "Paused"}
                      </p>
                      {player.status === "paused" ? (
                        <p>
                          {pauseCopy(
                            player.pausedOn,
                            player.plannedLastPausedOn,
                          )}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <PlayerPager
              page={roster.page}
              total={roster.total}
              hrefFor={(page) =>
                page > 1
                  ? `/app/batches/${batchId}?page=${page}`
                  : `/app/batches/${batchId}`
              }
            />
          </div>
        </section>
      </div>
    </main>
  );
}
