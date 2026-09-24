"use client";

import { useCallback, useState, type FormEvent } from "react";
import Link from "next/link";
import type { BatchRecord } from "@/lib/batches";
import type { FeeOptionRecord } from "@/lib/batch-fee-options";
import { packageFactsCopy } from "@/lib/package-copy";
import { ErrorToast } from "@/app/error-toast";
import { batchErrorCopy } from "./batch-form-copy";

type BatchesDirectoryProps = {
  batches: BatchRecord[];
  feeOptions: FeeOptionRecord[];
};

export function BatchesDirectory({
  batches,
  feeOptions,
}: BatchesDirectoryProps) {
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(batches.length === 0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorId, setErrorId] = useState(0);
  const dismissError = useCallback(() => setError(null), []);

  function showError(message: string) {
    setError(message);
    setErrorId((current) => current + 1);
  }

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
      showError(batchErrorCopy(body?.error) ?? "Could not add Batch.");
      setSubmitting(false);
      return;
    }

    const body = (await response.json()) as { id?: string };
    window.location.assign(
      body.id ? `/app/batches/${body.id}` : "/app/batches",
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {batches.length === 0 ? null : (
        <ul className="flex flex-col gap-3">
          {batches.map((batch) => {
            const offered = feeOptions.filter(
              (option) => option.batchId === batch.id && option.isOffered,
            );
            return (
              <li key={batch.id} className="card bg-base-100">
                <div className="card-body flex flex-col gap-2 py-3">
                  <Link
                    className="link font-medium"
                    href={`/app/batches/${batch.id}`}
                  >
                    {batch.name}
                  </Link>
                  <p className="text-sm">
                    {batch.isOpenForRegistration
                      ? "Open for Registration"
                      : "Closed for Registration"}
                  </p>
                  {offered.length === 0 ? (
                    <p className="text-base-content/70 text-sm">
                      No fee options yet.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {offered.map((option) => (
                        <li key={option.id} className="text-sm">
                          {option.label ? (
                            <p className="font-medium">{option.label}</p>
                          ) : null}
                          <p>{packageFactsCopy(option)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
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
          <button
            type="submit"
            className="btn btn-primary self-start"
            disabled={submitting || !name.trim()}
          >
            {submitting ? "Adding…" : "Add Batch"}
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="btn btn-primary self-start"
          onClick={() => setAdding(true)}
        >
          Add Batch
        </button>
      )}
      <ErrorToast key={errorId} message={error} onDismiss={dismissError} />
    </div>
  );
}
