import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/staff-session";
import { getImpersonationState } from "@/lib/impersonation";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { calendarDateInIst } from "@/lib/player-age";
import { listPlayerDirectory, type TermStatus } from "@/lib/players";
import { DashboardBackLink } from "../dashboard-back-link";
import { PlayerPager } from "./player-pager";

type PlayersPageProps = {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
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

function pageHref(q: string, page: number): string {
  const params = new URLSearchParams();
  if (q.trim()) {
    params.set("q", q.trim());
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `/app/players?${query}` : "/app/players";
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

export default async function PlayersPage({ searchParams }: PlayersPageProps) {
  const params = await searchParams;
  const q = firstParam(params.q);
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

  const directory = await listPlayerDirectory(academy.id, {
    q,
    page: requestedPage(firstParam(params.page)),
    today: calendarDateInIst(),
  });

  return (
    <main className="flex min-h-full flex-col p-6">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <DashboardBackLink />
        <section className="card bg-base-200 shadow">
          <div className="card-body gap-4">
            <h1 className="card-title">Players</h1>
            <form action="/app/players" method="get" className="flex gap-2">
              <input
                className="input input-bordered w-full"
                name="q"
                defaultValue={q}
                aria-label="Search Players"
              />
              <button className="btn btn-primary" type="submit">
                Search
              </button>
            </form>
            {directory.players.length === 0 ? (
              <p>
                {q.trim()
                  ? "No Players match that search."
                  : "No Players yet."}
              </p>
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
                      </Link>
                      <a className="link relative z-10" href={`tel:${player.phone}`}>
                        {player.phone}
                      </a>
                      {player.lines.map((line) => (
                        <p key={`${line.batchId}-${line.validFrom}`}>
                          {line.batchName} {statusLabel(line.status)}
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
              hrefFor={(page) => pageHref(q, page)}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
