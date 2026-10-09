"use client";

import { useCallback, useState, type FormEvent } from "react";
import Link from "next/link";
import { LinkPendingMark } from "../link-pending-mark";
import type { CoachRecord } from "@/lib/coaches";
import { ErrorToast } from "@/app/error-toast";
import { coachNameErrorCopy, coachWriteErrorCopy } from "./coach-form-copy";

type CoachesDirectoryProps = {
  coaches: CoachRecord[];
};

export function CoachesDirectory({ coaches }: CoachesDirectoryProps) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmCoach, setConfirmCoach] = useState<CoachRecord | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorId, setErrorId] = useState(0);
  const dismissError = useCallback(() => setError(null), []);

  function showError(message: string) {
    setError(message);
    setErrorId((current) => current + 1);
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const localError = coachNameErrorCopy(name);
    if (localError) {
      showError(localError);
      return;
    }

    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/coaches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      showError(coachWriteErrorCopy(body?.error));
      setSubmitting(false);
      return;
    }

    window.location.assign("/app/coaches");
  }

  async function onConfirmDelete() {
    if (!confirmCoach || deletingId) {
      return;
    }
    if (confirmName.trim() !== confirmCoach.name) {
      return;
    }

    setDeletingId(confirmCoach.id);
    setError(null);

    const response = await fetch(`/api/coaches/${confirmCoach.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      showError(coachWriteErrorCopy(body?.error));
      setDeletingId(null);
      return;
    }

    window.location.assign("/app/coaches");
  }

  function openDelete(coach: CoachRecord) {
    setConfirmCoach(coach);
    setConfirmName("");
    setError(null);
  }

  function cancelDelete() {
    setConfirmCoach(null);
    setConfirmName("");
  }

  const confirmMatches =
    confirmCoach !== null && confirmName.trim() === confirmCoach.name;

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-col gap-3" onSubmit={onAdd}>
        <label className="flex flex-col gap-1 text-sm">
          Coach name
          <input
            className="input input-bordered"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={submitting}
          />
        </label>
        <button
          type="submit"
          className="btn btn-neutral self-start"
          disabled={submitting}
        >
          {submitting ? (
            <span className="loading loading-spinner" aria-hidden="true" />
          ) : null}
          Add
        </button>
      </form>

      {coaches.length === 0 ? null : (
        <ul className="flex flex-col gap-3">
          {coaches.map((coach) => (
            <li key={coach.id} className="card bg-base-100">
              <div className="card-body flex flex-row items-center justify-between gap-3 py-3">
                <Link
                  className="link font-medium"
                  href={`/app/coaches/${coach.id}`}
                >
                  {coach.name}
                  <LinkPendingMark />
                </Link>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => openDelete(coach)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirmCoach ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="coach-delete-title"
            className="bg-base-100 rounded-box flex w-full max-w-sm flex-col gap-4 p-6 shadow"
          >
            <h2 id="coach-delete-title" className="text-lg font-semibold">
              Delete Coach
            </h2>
            <p>
              This Coach and their Coach attendance will be removed.
            </p>
            <label className="flex flex-col gap-1 text-sm">
              Type {confirmCoach.name} to confirm
              <input
                className="input input-bordered"
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
                disabled={deletingId !== null}
                autoFocus
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-error"
                disabled={!confirmMatches || deletingId !== null}
                onClick={() => void onConfirmDelete()}
              >
                {deletingId ? (
                  <span
                    className="loading loading-spinner"
                    aria-hidden="true"
                  />
                ) : null}
                Confirm
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={deletingId !== null}
                onClick={cancelDelete}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ErrorToast key={errorId} message={error} onDismiss={dismissError} />
    </div>
  );
}
