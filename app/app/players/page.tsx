import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/staff-session";
import { getImpersonationState } from "@/lib/impersonation";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { listBatches } from "@/lib/batches";
import { listFeeOptions } from "@/lib/batch-fee-options";
import { calendarDateInIst } from "@/lib/player-age";
import {
  directoryCut,
  listPlayerDirectory,
  type DirectoryCut,
} from "@/lib/players";
import { DashboardBackLink } from "../dashboard-back-link";
import { ManualAddForm } from "./manual-add-form";
import { PlayerPager } from "./player-pager";
import EnrollmentStatus from "../enrollment-status";
import { deactivatedOwnerPage } from "../deactivated-owner-page";
import { LinkPendingMark } from "../link-pending-mark";

type PlayersPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
    status?: string | string[];
  }>;
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

function directoryHref(q: string, cut: DirectoryCut, page = 1): string {
  const params = new URLSearchParams();
  if (q.trim()) {
    params.set("q", q.trim());
  }
  if (cut !== "all") {
    params.set("status", cut);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `/app/players?${query}` : "/app/players";
}

function emptyDirectoryCopy(q: string, cut: DirectoryCut): string {
  if (q.trim()) {
    return "No Players match that search.";
  }
  if (cut === "paused") {
    return "No paused Players.";
  }
  if (cut === "lapsed") {
    return "No lapsed Players.";
  }
  return "No Players yet.";
}

export default async function PlayersPage({ searchParams }: PlayersPageProps) {
  const blocked = await deactivatedOwnerPage();
  if (blocked) {
    return blocked;
  }

  const params = await searchParams;
  const q = firstParam(params.q);
  const cut = directoryCut(firstParam(params.status));
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
  const [directory, batches, feeOptions] = await Promise.all([
    listPlayerDirectory(academy.id, {
      q,
      page: requestedPage(firstParam(params.page)),
      today,
      cut,
    }),
    listBatches(academy.id),
    listFeeOptions(academy.id),
  ]);

  const canManualAdd = Boolean(impersonation || !session.user.isSuperAdmin);

  return (
    <main className="flex min-h-full flex-col p-6">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <DashboardBackLink />
        <section className="card bg-base-200 shadow">
          <div className="card-body gap-4">
            <h1 className="card-title">Players</h1>
            {canManualAdd ? (
              <ManualAddForm
                mode="directory"
                batches={batches}
                feeOptions={feeOptions}
                today={today}
              />
            ) : null}
            <nav className="join" aria-label="Directory">
              {(
                [
                  ["all", "All"],
                  ["paused", "Paused"],
                  ["lapsed", "Lapsed"],
                ] as const
              ).map(([choice, label]) => (
                <Link
                  key={choice}
                  className={`btn join-item btn-sm${choice === cut ? " btn-active" : ""}`}
                  href={directoryHref(q, choice)}
                  aria-current={choice === cut ? "page" : undefined}
                >
                  {label}
                  <LinkPendingMark />
                </Link>
              ))}
            </nav>
            <form action="/app/players" method="get" className="flex gap-2">
              {cut === "all" ? null : (
                <input type="hidden" name="status" value={cut} />
              )}
              <input
                className="input input-bordered w-full"
                name="q"
                defaultValue={q}
                aria-label="Search Players"
              />
              <button className="btn btn-neutral" type="submit">
                Search
              </button>
            </form>
            {directory.players.length === 0 ? (
              <p>{emptyDirectoryCopy(q, cut)}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {directory.players.map((player) => (
                  <li key={player.id} className="card bg-base-100 relative">
                    <div className="card-body gap-1 py-3">
                      <Link
                        className="link font-medium after:absolute after:inset-0"
                        href={`/app/players/${player.id}`}
                      >
                        {player.fullName}
                        <LinkPendingMark />
                      </Link>
                      <a className="link relative z-10" href={`tel:${player.phone}`}>
                        {player.phone}
                      </a>
                      {player.lines.map((line) => (
                        <p key={`${line.batchId}-${line.validFrom}`}>
                          {line.batchName}
                          <EnrollmentStatus
                            status={line.status}
                            startsLater={line.startsLater}
                          />
                        </p>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <PlayerPager
              page={directory.page}
              total={directory.total}
              hrefFor={(page) => directoryHref(q, cut, page)}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
