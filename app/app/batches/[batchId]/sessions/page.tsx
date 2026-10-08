import { notFound, redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/staff-session";
import { getImpersonationState } from "@/lib/impersonation";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { calendarDateInIst, isValidCalendarDate } from "@/lib/player-age";
import { PLAYERS_PER_PAGE } from "@/lib/players";
import {
  getSessionAttendance,
  listSavedSessions,
} from "@/lib/batch-sessions";
import { AttendanceEditor } from "./attendance-editor";
import { deactivatedOwnerPage } from "../../../deactivated-owner-page";

type SessionsPageProps = {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{
    date?: string | string[];
    page?: string | string[];
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

function resolveAttendanceDate(
  raw: string,
  today: string,
): { ok: true; date: string } | { ok: false } {
  if (!raw) {
    return { ok: true, date: today };
  }
  if (!isValidCalendarDate(raw) || raw > today) {
    return { ok: false };
  }
  return { ok: true, date: raw };
}

export default async function BatchSessionsPage({
  params,
  searchParams,
}: SessionsPageProps) {
  const blocked = await deactivatedOwnerPage();
  if (blocked) {
    return blocked;
  }

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

  const today = calendarDateInIst();
  const dateState = resolveAttendanceDate(firstParam(query.date), today);
  const page = requestedPage(firstParam(query.page));
  const [attendance, savedSessions] = await Promise.all([
    dateState.ok
      ? getSessionAttendance(academy.id, batchId, dateState.date, today)
      : Promise.resolve(null),
    listSavedSessions(academy.id, batchId, page),
  ]);

  if (!savedSessions || (dateState.ok && !attendance)) {
    notFound();
  }

  return (
    <main className="flex min-h-full flex-col p-6">
      <AttendanceEditor
        batchId={batchId}
        batchName={savedSessions.batchName}
        today={today}
        activeDate={dateState.ok ? dateState.date : null}
        invalidDate={!dateState.ok}
        attendance={attendance}
        sessions={savedSessions.sessions}
        sessionPage={savedSessions.page}
        sessionTotal={savedSessions.total}
        pageSize={PLAYERS_PER_PAGE}
      />
    </main>
  );
}
