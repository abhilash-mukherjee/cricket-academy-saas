"use client";

import { useCallback, useState } from "react";
import type { CoachRecord } from "@/lib/coaches";
import { ErrorToast } from "@/app/error-toast";
import { coachNameErrorCopy, coachWriteErrorCopy } from "./coach-form-copy";

type CoachEditorProps = {
  coach: CoachRecord;
};

export function CoachEditor({ coach }: CoachEditorProps) {
  const [name, setName] = useState(coach.name);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorId, setErrorId] = useState(0);
  const dismissError = useCallback(() => setError(null), []);

  function showError(message: string) {
    setError(message);
    setErrorId((current) => current + 1);
  }

  async function onSave() {
    if (submitting) {
      return;
    }

    const localError = coachNameErrorCopy(name);
    if (localError) {
      showError(localError);
      return;
    }

    if (name.trim() === coach.name) {
      setEditing(false);
      setError(null);
      return;
    }

    setSubmitting(true);
    setError(null);

    const response = await fetch(`/api/coaches/${coach.id}`, {
      method: "PATCH",
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

    // Full navigation; avoids useRouter (breaks SSR tests).
    window.location.assign(`/app/coaches/${coach.id}`); // eslint-disable-line @next/next/no-location-assign-relative-destination
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {editing ? (
          <input
            className="input input-bordered min-w-0 flex-1"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={submitting}
            aria-label="Coach name"
          />
        ) : (
          <h1 className="card-title min-w-0 flex-1">{name}</h1>
        )}
        <button
          type="button"
          className="btn btn-sm shrink-0"
          disabled={submitting}
          onClick={() => {
            if (editing) {
              void onSave();
              return;
            }
            setEditing(true);
          }}
        >
          {submitting ? (
            <span className="loading loading-spinner" aria-hidden="true" />
          ) : null}
          {editing ? "Save" : "Edit"}
        </button>
      </div>
      <ErrorToast key={errorId} message={error} onDismiss={dismissError} />
    </div>
  );
}
