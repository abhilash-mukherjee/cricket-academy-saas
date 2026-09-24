"use client";

import { useRef, useState } from "react";
import { lastCoveredDay } from "@/lib/enrollment-term";
import { isValidCalendarDate } from "@/lib/player-age";
import { packageFactsCopy } from "@/lib/package-copy";
import type { PendingRegistration } from "@/lib/registrations";

type InboxProps = {
  registrations: PendingRegistration[];
  today: string;
};

export function inboxErrorCopy(error: string): string {
  switch (error) {
    case "overlaps":
      return "This term overlaps an Enrollment on this Batch. Reject this Registration.";
    case "paused":
      return "An Enrollment on this Batch is paused. Reject this Registration.";
    case "term-not-covering-today":
      return "That term would not cover today.";
    case "invalid-input":
      return "Choose today or an earlier date.";
    case "not-found":
      return "That Registration was not found.";
    default:
      return "Could not update this Registration.";
  }
}

function formatSubmittedAt(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function RegistrationInbox({ registrations, today }: InboxProps) {
  const [rows, setRows] = useState(registrations);
  const [validFromById, setValidFromById] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(registrations.map((row) => [row.id, today])),
  );
  const [inFlightId, setInFlightId] = useState<string | null>(null);
  const inFlightRef = useRef<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [pageNote, setPageNote] = useState<string | null>(null);

  function dropRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
    setRowError((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function accept(row: PendingRegistration) {
    if (inFlightRef.current) {
      return;
    }
    const validFrom = validFromById[row.id] ?? today;
    inFlightRef.current = row.id;
    setInFlightId(row.id);
    setRowError((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });

    try {
      const response = await fetch(`/api/registrations/${row.id}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ validFrom }),
      });

      if (response.ok) {
        dropRow(row.id);
        return;
      }

      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      const error = body?.error ?? "invalid-input";
      if (error === "not-pending") {
        dropRow(row.id);
        setPageNote("That Registration was already handled.");
        return;
      }
      setRowError((current) => ({ ...current, [row.id]: error }));
    } finally {
      inFlightRef.current = null;
      setInFlightId(null);
    }
  }

  async function reject(row: PendingRegistration) {
    if (inFlightRef.current) {
      return;
    }
    if (!window.confirm("Reject this Registration?")) {
      return;
    }
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = row.id;
    setInFlightId(row.id);
    try {
      const response = await fetch(`/api/registrations/${row.id}/reject`, {
        method: "POST",
      });

      if (response.ok) {
        dropRow(row.id);
        return;
      }

      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (body?.error === "not-pending") {
        dropRow(row.id);
        setPageNote("That Registration was already handled.");
        return;
      }
      setRowError((current) => ({
        ...current,
        [row.id]: body?.error ?? "not-found",
      }));
    } finally {
      inFlightRef.current = null;
      setInFlightId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {pageNote ? <p className="alert alert-info text-sm">{pageNote}</p> : null}
      {rows.length === 0 ? (
        <p>No pending Registrations.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((row) => {
            const validFrom = validFromById[row.id] ?? today;
            const coversThrough = isValidCalendarDate(validFrom)
              ? lastCoveredDay(validFrom, row.termDays)
              : null;
            const termMissesToday =
              coversThrough !== null && coversThrough < today;
            const busy = inFlightId === row.id;
            const error = rowError[row.id];
            return (
              <li key={row.id} className="rounded-box border-base-300 border p-4">
                <p className="font-medium">{row.playerFullName}</p>
                <p>Phone: {row.contactPhone}</p>
                <p>Batch: {row.batchName}</p>
                <p>
                  {packageFactsCopy({
                    daysPerWeek: row.daysPerWeek,
                    termDays: row.termDays,
                    feePaise: row.feePaise,
                  })}
                </p>
                {row.existingPlayer ? (
                  <p>
                    Links to existing Player: {row.existingPlayer.fullName} ·{" "}
                    {row.existingPlayer.phone}
                  </p>
                ) : null}
                {row.existingPlayer &&
                row.existingPlayer.dateOfBirth !== row.playerDateOfBirth ? (
                  <p>
                    Existing Player DOB is {row.existingPlayer.dateOfBirth};
                    this Registration has {row.playerDateOfBirth} — existing
                    values are kept
                  </p>
                ) : null}
                <label className="mt-3 flex flex-col gap-1 text-sm">
                  Valid from
                  <input
                    type="date"
                    className="input input-bordered"
                    max={today}
                    value={validFrom}
                    onChange={(event) =>
                      setValidFromById((current) => ({
                        ...current,
                        [row.id]: event.target.value,
                      }))
                    }
                  />
                </label>
                {coversThrough ? <p>Covers through {coversThrough}</p> : null}
                {termMissesToday ? (
                  <p>That term would not cover today.</p>
                ) : null}
                {error ? (
                  <p role="alert">{inboxErrorCopy(error)}</p>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => void accept(row)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => void reject(row)}
                  >
                    Reject
                  </button>
                </div>
                <details className="mt-3">
                  <summary>More details</summary>
                  <p>Date of birth: {row.playerDateOfBirth}</p>
                  {row.guardianFullName && row.guardianPhone ? (
                    <p>
                      Guardian: {row.guardianFullName}, {row.guardianPhone}
                    </p>
                  ) : null}
                  {row.contactEmail ? <p>Email: {row.contactEmail}</p> : null}
                  {row.note ? <p>Note: {row.note}</p> : null}
                  <p>Submitted {formatSubmittedAt(row.submittedAt)}</p>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
