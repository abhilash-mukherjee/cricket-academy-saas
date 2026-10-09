"use client";

import { useCallback, useState, type FormEvent } from "react";
import type { CoachRecord } from "@/lib/coaches";
import { ErrorToast } from "@/app/error-toast";
import { coachNameErrorCopy, coachWriteErrorCopy } from "./coach-form-copy";

type CoachEditorProps = {
  coach: CoachRecord;
};

export function CoachEditor({ coach }: CoachEditorProps) {
  const [name, setName] = useState(coach.name);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorId, setErrorId] = useState(0);
  const dismissError = useCallback(() => setError(null), []);

  function showError(message: string) {
    setError(message);
    setErrorId((current) => current + 1);
  }

  async function onSave(event: FormEvent) {
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

    window.location.assign(`/app/coaches/${coach.id}`);
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSave}>
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          className="input input-bordered"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={submitting}
        />
      </label>
      <button
        type="submit"
        className="btn btn-primary self-start"
        disabled={submitting}
      >
        {submitting ? (
          <span className="loading loading-spinner" aria-hidden="true" />
        ) : null}
        Save
      </button>
      <ErrorToast key={errorId} message={error} onDismiss={dismissError} />
    </form>
  );
}
