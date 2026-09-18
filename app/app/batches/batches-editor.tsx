"use client";

import { useState, type FormEvent } from "react";
import type { BatchRecord } from "@/lib/batches";

type BatchesEditorProps = {
  batches: BatchRecord[];
};

function errorCopy(error: string | null | undefined): string | null {
  switch (error) {
    case "invalid-input":
      return "Batch name is required.";
    case "name-taken":
      return "That Batch name is already used at this Academy.";
    case "not-found":
      return "That Batch was not found.";
    default:
      return error ?? null;
  }
}

export function BatchesEditor({ batches }: BatchesEditorProps) {
  const [name, setName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(errorCopy(body?.error) ?? "Could not add Batch.");
      setSubmitting(false);
      return;
    }

    // Full navigation; avoids useRouter (breaks SSR tests).
    window.location.assign("/app/batches"); // eslint-disable-line @next/next/no-location-assign-relative-destination
  }

  async function onRename(event: FormEvent, batch: BatchRecord) {
    event.preventDefault();
    setRenamingId(batch.id);
    setError(null);

    const nextName = drafts[batch.id] ?? batch.name;
    const response = await fetch(`/api/batches/${batch.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nextName }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(errorCopy(body?.error) ?? "Could not rename Batch.");
      setRenamingId(null);
      return;
    }

    window.location.assign("/app/batches"); // eslint-disable-line @next/next/no-location-assign-relative-destination
  }

  return (
    <div className="flex flex-col gap-6">
      {batches.length === 0 ? (
        <p className="text-base-content/70 text-sm">
          This Academy has no Batches yet. Add the first Batch to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {batches.map((batch) => (
            <li key={batch.id} className="card bg-base-100">
              <form
                className="card-body flex flex-col gap-2 py-3"
                onSubmit={(event) => void onRename(event, batch)}
              >
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">{batch.name}</span>
                  <input
                    className="input input-bordered"
                    value={drafts[batch.id] ?? batch.name}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [batch.id]: event.target.value,
                      }))
                    }
                    aria-label={`Rename ${batch.name}`}
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="btn btn-ghost btn-sm self-start"
                  disabled={renamingId === batch.id}
                >
                  {renamingId === batch.id ? "Saving…" : "Rename"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form className="flex flex-col gap-3" onSubmit={onAdd}>
        <label className="flex flex-col gap-1 text-sm">
          Add a Batch
          <input
            className="input input-bordered"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        {error ? <p className="text-error text-sm">{error}</p> : null}
        <button
          type="submit"
          className="btn btn-primary self-start"
          disabled={submitting || !name.trim()}
        >
          {submitting ? "Adding…" : "Add Batch"}
        </button>
      </form>
    </div>
  );
}
