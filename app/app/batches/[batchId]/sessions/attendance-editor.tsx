"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SuccessToast } from "@/app/success-toast";
import { DashboardBackLink } from "@/app/app/dashboard-back-link";
import { formatCalendarDate } from "@/lib/format-date";
import { matchesPlayerQuery } from "@/lib/player-search";

type AttendancePlayer = {
  playerId: string;
  fullName: string;
  phone: string;
  isPresent: boolean;
};

type AttendanceSnapshot = {
  saved: boolean;
  pausedPlayersOmitted: boolean;
  players: AttendancePlayer[];
};

type SavedSession = {
  sessionDate: string;
  presentCount: number;
  listedCount: number;
};

type AttendanceEditorProps = {
  batchId: string;
  batchName: string;
  today: string;
  activeDate: string | null;
  invalidDate: boolean;
  attendance: AttendanceSnapshot | null;
  sessions: SavedSession[];
  sessionPage: number;
  sessionTotal: number;
  pageSize: number;
};

const EMPTY_ATTENDANCE: AttendanceSnapshot = {
  saved: false,
  pausedPlayersOmitted: false,
  players: [],
};

function attendanceHref(batchId: string, date: string, page = 1): string {
  const params = new URLSearchParams();
  params.set("date", date);
  if (page > 1) {
    params.set("page", String(page));
  }
  return `/app/batches/${batchId}/sessions?${params}`;
}

function dateOf(href: string): string | null {
  const query = href.split("?")[1] ?? "";
  return new URLSearchParams(query).get("date");
}

function loadedChecks(
  players: AttendancePlayer[],
  saved: boolean,
): Record<string, boolean> {
  return Object.fromEntries(
    players.map((player) => [
      player.playerId,
      saved ? player.isPresent : false,
    ]),
  );
}

function checksDiffer(
  checks: Record<string, boolean>,
  baseline: Record<string, boolean>,
  players: AttendancePlayer[],
): boolean {
  return players.some(
    (player) =>
      Boolean(checks[player.playerId]) !== Boolean(baseline[player.playerId]),
  );
}

function saveErrorCopy(error: string): string {
  if (error === "session-date") {
    return "Choose today or an earlier date.";
  }
  if (error === "not-found") {
    return "That Batch was not found.";
  }
  return "Could not save attendance.";
}

function isSnapshot(value: unknown): value is AttendanceSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }
  const snapshot = value as AttendanceSnapshot;
  return typeof snapshot.saved === "boolean" && Array.isArray(snapshot.players);
}

export function AttendanceEditor({
  batchId,
  batchName,
  today,
  activeDate,
  invalidDate,
  attendance,
  sessions,
  sessionPage,
  sessionTotal,
  pageSize,
}: AttendanceEditorProps) {
  const router = useRouter();
  const snapshot = attendance ?? EMPTY_ATTENDANCE;
  const serverKey = `${snapshot.saved}:${snapshot.pausedPlayersOmitted}:${snapshot.players
    .map((player) => `${player.playerId}:${player.isPresent ? 1 : 0}`)
    .join("|")}`;
  const sessionsKey = `${sessionPage}:${sessionTotal}:${sessions
    .map(
      (session) =>
        `${session.sessionDate}:${session.presentCount}:${session.listedCount}`,
    )
    .join("|")}`;

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const sessionTotalRef = useRef(sessionTotal);
  sessionTotalRef.current = sessionTotal;

  const [players, setPlayers] = useState(snapshot.players);
  const [saved, setSaved] = useState(snapshot.saved);
  const [pausedPlayersOmitted, setPausedPlayersOmitted] = useState(
    snapshot.pausedPlayersOmitted,
  );
  const [checks, setChecks] = useState(() =>
    loadedChecks(snapshot.players, snapshot.saved),
  );
  const [baseline, setBaseline] = useState(() =>
    loadedChecks(snapshot.players, snapshot.saved),
  );
  const [search, setSearch] = useState("");
  const [sessionRows, setSessionRows] = useState(sessions);
  const [sessionCount, setSessionCount] = useState(sessionTotal);
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [successId, setSuccessId] = useState(0);
  const dismissSuccess = useCallback(() => setSuccess(null), []);

  useEffect(() => {
    const current = snapshotRef.current;
    const nextChecks = loadedChecks(current.players, current.saved);
    setPlayers(current.players);
    setSaved(current.saved);
    setPausedPlayersOmitted(current.pausedPlayersOmitted);
    setChecks(nextChecks);
    setBaseline(nextChecks);
  }, [serverKey]);

  useEffect(() => {
    setSessionRows(sessionsRef.current);
    setSessionCount(sessionTotalRef.current);
  }, [sessionsKey]);

  const dirty = checksDiffer(checks, baseline, players);
  const visible = players.filter((player) =>
    matchesPlayerQuery(player, search),
  );
  const backHref = `/app/batches/${batchId}`;

  function showSuccess(message: string) {
    setSuccess(message);
    setSuccessId((current) => current + 1);
  }

  function adopt(next: AttendanceSnapshot) {
    const nextChecks = loadedChecks(next.players, next.saved);
    setPlayers(next.players);
    setSaved(next.saved);
    setPausedPlayersOmitted(next.pausedPlayersOmitted);
    setChecks(nextChecks);
    setBaseline(nextChecks);
  }

  function guard(event: { preventDefault(): void }, href: string) {
    if (!dirty) {
      return;
    }
    event.preventDefault();
    setConfirmEmpty(false);
    setConfirmDiscard(false);
    setPendingHref(href);
  }

  function changeDate(next: string) {
    if (!next || next === activeDate) {
      return;
    }
    const href = attendanceHref(batchId, next);
    if (!dirty) {
      router.push(href);
      return;
    }
    setConfirmEmpty(false);
    setConfirmDiscard(false);
    setPendingHref(href);
  }

  function pageOf(href: string): number {
    const query = href.split("?")[1] ?? "";
    const raw = new URLSearchParams(query).get("page");
    if (!raw || !/^\d+$/.test(raw)) {
      return 1;
    }
    const page = Number(raw);
    return page >= 1 ? page : 1;
  }

  function confirmLeave() {
    if (!pendingHref) {
      return;
    }
    const href = pendingHref;
    setPendingHref(null);
    if (dateOf(href) === activeDate && pageOf(href) === sessionPage) {
      setChecks({ ...baseline });
      setSearch("");
      return;
    }
    router.push(href);
  }

  function requestSave() {
    if (players.length === 0 && !saved) {
      setPendingHref(null);
      setConfirmDiscard(false);
      setConfirmEmpty(true);
      return;
    }
    void save();
  }

  async function save() {
    if (submitting || !activeDate) {
      return;
    }
    const wasSaved = saved;
    setSubmitting(true);
    setInlineError(null);
    setConfirmEmpty(false);
    try {
      const response = await fetch(
        `/api/batches/${batchId}/sessions/${activeDate}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            playerIds: players.map((player) => player.playerId),
            presentPlayerIds: players
              .filter((player) => checks[player.playerId])
              .map((player) => player.playerId),
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (response.status === 409 && payload?.error === "stale-list") {
        setSearch("");
        setChecks({ ...baseline });
        setInlineError(
          "This list changed. Load it again and mark attendance.",
        );
        router.refresh();
        return;
      }
      if (!response.ok || !isSnapshot(payload)) {
        setInlineError(saveErrorCopy(payload?.error ?? ""));
        return;
      }
      adopt(payload);
      if (sessionPage === 1) {
        const presentCount = payload.players.filter(
          (player) => player.isPresent,
        ).length;
        setSessionRows((current) => {
          const without = current.filter(
            (session) => session.sessionDate !== activeDate,
          );
          return [
            {
              sessionDate: activeDate,
              presentCount,
              listedCount: payload.players.length,
            },
            ...without,
          ]
            .sort((left, right) =>
              left.sessionDate < right.sessionDate ? 1 : -1,
            )
            .slice(0, pageSize);
        });
        if (!wasSaved) {
          setSessionCount((count) => count + 1);
        }
      }
      showSuccess("Attendance saved");
      router.refresh();
    } catch {
      setInlineError("Could not save attendance.");
    } finally {
      setSubmitting(false);
    }
  }

  async function discard() {
    if (submitting || !activeDate) {
      return;
    }
    setSubmitting(true);
    setInlineError(null);
    setConfirmDiscard(false);
    try {
      const response = await fetch(
        `/api/batches/${batchId}/sessions/${activeDate}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok || !isSnapshot(payload)) {
        setInlineError(
          payload?.error === "not-found"
            ? "That Session was not found."
            : "Could not discard this Session.",
        );
        return;
      }
      adopt(payload);
      setSearch("");
      setSessionRows((current) =>
        current.filter((session) => session.sessionDate !== activeDate),
      );
      setSessionCount((count) => Math.max(0, count - 1));
      showSuccess("Session discarded");
      router.refresh();
    } catch {
      setInlineError("Could not discard this Session.");
    } finally {
      setSubmitting(false);
    }
  }

  function setAll(present: boolean) {
    setChecks(
      Object.fromEntries(players.map((player) => [player.playerId, present])),
    );
  }

  const showListTools = !invalidDate && players.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <DashboardBackLink
        href={backHref}
        label="Batch"
        onClick={guard}
      />
      <section className="card bg-base-200 shadow">
        <div className="card-body gap-4">
          <h1 className="card-title">{batchName}</h1>
          <p>Attendance</p>
          <label className="flex flex-col gap-1 text-sm">
            Date
            <input
              type="date"
              className="input input-bordered"
              max={today}
              value={invalidDate || !activeDate ? "" : activeDate}
              aria-label="Session date"
              onChange={(event) => changeDate(event.target.value)}
            />
          </label>
          {invalidDate ? (
            <p className="text-error text-sm">
              Choose today or an earlier date.{" "}
              <Link href={attendanceHref(batchId, today)} className="link">
                Open today
              </Link>
            </p>
          ) : null}
          {!invalidDate && saved ? (
            <p>
              This list is fixed. Discard rebuilds it from current Enrollments.
            </p>
          ) : null}
          {!invalidDate && !saved && pausedPlayersOmitted ? (
            <p>Paused Players are not listed.</p>
          ) : null}
          {showListTools ? (
            <input
              type="search"
              className="input input-bordered w-full"
              value={search}
              aria-label="Search Players"
              onChange={(event) => setSearch(event.target.value)}
            />
          ) : null}
          {showListTools ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setAll(true)}
              >
                Mark all {players.length} present
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setAll(false)}
              >
                Clear all {players.length}
              </button>
            </div>
          ) : null}
          {showListTools ? <p>Unchecked Players are absent.</p> : null}
          {showListTools &&
          search.trim() !== "" &&
          visible.length < players.length ? (
            <p>
              Showing {visible.length} of {players.length}
            </p>
          ) : null}
          {!invalidDate && players.length === 0 ? (
            <p>
              {saved
                ? "Nobody on this Session"
                : "Nobody to mark on this date."}
            </p>
          ) : null}
          {showListTools ? (
            <ul className="flex flex-col gap-3">
              {visible.map((player) => {
                const playerHref = `/app/players/${player.playerId}?fromBatch=${batchId}&sessionDate=${activeDate}`;
                return (
                  <li key={player.playerId} className="card bg-base-100">
                    <div className="card-body flex-row items-start gap-3 py-3">
                      <input
                        type="checkbox"
                        className="checkbox mt-1"
                        checked={Boolean(checks[player.playerId])}
                        aria-label={`Present: ${player.fullName}`}
                        onChange={() =>
                          setChecks((current) => ({
                            ...current,
                            [player.playerId]: !current[player.playerId],
                          }))
                        }
                      />
                      <div className="flex flex-col gap-1">
                        <Link
                          href={playerHref}
                          className="link font-medium"
                          onClick={(event) => guard(event, playerHref)}
                        >
                          {player.fullName}
                        </Link>
                        <a className="link" href={`tel:${player.phone}`}>
                          {player.phone}
                        </a>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {inlineError ? (
            <p className="text-error text-sm">{inlineError}</p>
          ) : null}
          {!invalidDate && confirmEmpty ? (
            <div className="flex flex-col gap-2">
              <p>
                Nobody is on this Session. Players who become eligible later
                stay off until Discard.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={submitting}
                  onClick={() => void save()}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={submitting}
                  onClick={() => setConfirmEmpty(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          {!invalidDate && confirmDiscard ? (
            <div className="flex flex-col gap-2">
              <p>
                Discard this Session? The list rebuilds from current
                Enrollments.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={submitting}
                  onClick={() => void discard()}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={submitting}
                  onClick={() => setConfirmDiscard(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          {!invalidDate && !confirmEmpty && !confirmDiscard ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting}
                onClick={requestSave}
              >
                Save
              </button>
              {saved ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={submitting}
                  onClick={() => {
                    setPendingHref(null);
                    setConfirmEmpty(false);
                    setConfirmDiscard(true);
                  }}
                >
                  Discard
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
      <section className="card bg-base-200 shadow">
        <div className="card-body gap-4">
          <h2 className="card-title text-lg">Saved Sessions</h2>
          {sessionRows.length === 0 ? (
            <p>No saved Sessions.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {sessionRows.map((session) => {
                const href = attendanceHref(batchId, session.sessionDate);
                return (
                  <li key={session.sessionDate}>
                    <Link
                      href={href}
                      className="card bg-base-100"
                      onClick={(event) => guard(event, href)}
                    >
                      <span className="card-body gap-1 py-3">
                        <span className="font-medium">
                          {formatCalendarDate(session.sessionDate)}
                        </span>
                        <span>
                          {session.listedCount === 0
                            ? "Nobody on this Session"
                            : `${session.presentCount} of ${session.listedCount} present`}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {sessionCount > pageSize ? (
            <p className="flex flex-wrap items-center gap-3 text-sm">
              {sessionPage > 1 ? (
                <Link
                  href={attendanceHref(
                    batchId,
                    activeDate ?? today,
                    sessionPage - 1,
                  )}
                  className="btn btn-sm"
                >
                  Previous
                </Link>
              ) : null}
              <span>
                {(sessionPage - 1) * pageSize + 1}–
                {Math.min(sessionPage * pageSize, sessionCount)} of{" "}
                {sessionCount}
              </span>
              {sessionPage * pageSize < sessionCount ? (
                <Link
                  href={attendanceHref(
                    batchId,
                    activeDate ?? today,
                    sessionPage + 1,
                  )}
                  className="btn btn-sm"
                >
                  Next
                </Link>
              ) : null}
            </p>
          ) : null}
        </div>
      </section>
      {pendingHref ? (
        <div className="card bg-base-100 sticky bottom-4 z-10 shadow">
          <div className="card-body gap-2 p-4">
            <p>You have unsaved attendance checks.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={confirmLeave}
              >
                Leave
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPendingHref(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <SuccessToast
        key={successId}
        message={success}
        onDismiss={dismissSuccess}
      />
    </div>
  );
}
