"use client";

import { useCallback, useState, type FormEvent } from "react";
import type { BatchRecord } from "@/lib/batches";
import type { FeeOptionRecord } from "@/lib/batch-fee-options";
import { ErrorToast } from "@/app/error-toast";

type BatchesEditorProps = {
  batches: BatchRecord[];
  feeOptions: FeeOptionRecord[];
};

type NewFeeOptionDraft = {
  daysPerWeek: string;
  termMonths: string;
  feeInr: string;
  label: string;
};

type FeeOptionEditDraft = {
  feeInr: string;
  label: string;
  sortOrder: string;
};

const emptyNewFeeOptionDraft: NewFeeOptionDraft = {
  daysPerWeek: "",
  termMonths: "",
  feeInr: "",
  label: "",
};

function feeOptionEditDraft(
  option: FeeOptionRecord,
  drafts: Record<string, FeeOptionEditDraft>,
): FeeOptionEditDraft {
  return (
    drafts[option.id] ?? {
      feeInr: String(option.feePaise / 100),
      label: option.label ?? "",
      sortOrder: String(option.sortOrder),
    }
  );
}

function batchErrorCopy(error: string | null | undefined): string | null {
  switch (error) {
    case "invalid-input":
      return "Batch name is required.";
    case "name-taken":
      return "That Batch name is already used at this Academy.";
    case "not-found":
      return "That Batch was not found.";
    case "no-offered-package":
      return "Add an offered fee option before opening this Batch.";
    case "close-first":
      return "Close this Batch for Registration first.";
    default:
      return error ?? null;
  }
}

function feeOptionErrorCopy(error: string | null | undefined): string | null {
  switch (error) {
    case "invalid-input":
      return "Days per week must be 1–7, term a positive number of months, and price a positive amount in INR.";
    case "identity-taken":
      return "That days-per-week and term package already exists on this Batch.";
    case "not-found":
      return "That fee option was not found.";
    case "in-use":
      return "This fee option cannot be deleted because a Registration references it. Stop offering it instead.";
    case "close-first":
      return "Close this Batch for Registration first.";
    default:
      return error ?? null;
  }
}

function formatInr(feePaise: number): string {
  return `₹${(feePaise / 100).toLocaleString("en-IN")}`;
}

function daysCopy(daysPerWeek: number): string {
  return daysPerWeek === 1 ? "1 day per week" : `${daysPerWeek} days per week`;
}

function termCopy(termMonths: number): string {
  return termMonths === 1 ? "1 month" : `${termMonths} months`;
}

export function BatchesEditor({ batches, feeOptions }: BatchesEditorProps) {
  const [name, setName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newFeeOptionDrafts, setNewFeeOptionDrafts] = useState<
    Record<string, NewFeeOptionDraft>
  >({});
  const [feeOptionEditDrafts, setFeeOptionEditDrafts] = useState<
    Record<string, FeeOptionEditDraft>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [togglingOpenId, setTogglingOpenId] = useState<string | null>(null);
  const [addingFeeBatchId, setAddingFeeBatchId] = useState<string | null>(null);
  const [savingFeeOptionId, setSavingFeeOptionId] = useState<string | null>(
    null,
  );
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
      showError(batchErrorCopy(body?.error) ?? "Could not rename Batch.");
      setRenamingId(null);
      return;
    }

    window.location.assign("/app/batches"); // eslint-disable-line @next/next/no-location-assign-relative-destination
  }

  async function onToggleOpen(batch: BatchRecord) {
    setTogglingOpenId(batch.id);
    setError(null);

    const response = await fetch(`/api/batches/${batch.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        isOpenForRegistration: !batch.isOpenForRegistration,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      showError(
        batchErrorCopy(body?.error) ??
          (batch.isOpenForRegistration
            ? "Could not close this Batch."
            : "Could not open this Batch."),
      );
      setTogglingOpenId(null);
      return;
    }

    window.location.assign("/app/batches"); // eslint-disable-line @next/next/no-location-assign-relative-destination
  }

  async function onAddFeeOption(event: FormEvent, batch: BatchRecord) {
    event.preventDefault();
    setAddingFeeBatchId(batch.id);
    setError(null);

    const draft = newFeeOptionDrafts[batch.id] ?? emptyNewFeeOptionDraft;
    const response = await fetch(`/api/batches/${batch.id}/fee-options`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        daysPerWeek: Number(draft.daysPerWeek),
        termMonths: Number(draft.termMonths),
        feeInr: Number(draft.feeInr),
        label: draft.label,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      showError(feeOptionErrorCopy(body?.error) ?? "Could not add fee option.");
      setAddingFeeBatchId(null);
      return;
    }

    window.location.assign("/app/batches"); // eslint-disable-line @next/next/no-location-assign-relative-destination
  }

  async function patchFeeOption(
    batchId: string,
    feeOptionId: string,
    body: Record<string, unknown>,
    fallback: string,
  ) {
    setSavingFeeOptionId(feeOptionId);
    setError(null);

    const response = await fetch(
      `/api/batches/${batchId}/fee-options/${feeOptionId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const responseBody = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      showError(feeOptionErrorCopy(responseBody?.error) ?? fallback);
      setSavingFeeOptionId(null);
      return;
    }

    window.location.assign("/app/batches"); // eslint-disable-line @next/next/no-location-assign-relative-destination
  }

  async function onSaveFeeOption(
    event: FormEvent,
    batch: BatchRecord,
    option: FeeOptionRecord,
  ) {
    event.preventDefault();
    const draft = feeOptionEditDraft(option, feeOptionEditDrafts);
    await patchFeeOption(
      batch.id,
      option.id,
      {
        feeInr: Number(draft.feeInr),
        label: draft.label,
        sortOrder: Number(draft.sortOrder),
      },
      "Could not update fee option.",
    );
  }

  async function onToggleOffered(batch: BatchRecord, option: FeeOptionRecord) {
    await patchFeeOption(
      batch.id,
      option.id,
      { isOffered: !option.isOffered },
      option.isOffered
        ? "Could not stop offering this fee option."
        : "Could not offer this fee option again.",
    );
  }

  async function onDeleteFeeOption(
    batch: BatchRecord,
    option: FeeOptionRecord,
  ) {
    setSavingFeeOptionId(option.id);
    setError(null);

    const response = await fetch(
      `/api/batches/${batch.id}/fee-options/${option.id}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      showError(
        feeOptionErrorCopy(body?.error) ?? "Could not delete fee option.",
      );
      setSavingFeeOptionId(null);
      return;
    }

    window.location.assign("/app/batches"); // eslint-disable-line @next/next/no-location-assign-relative-destination
  }

  function updateNewFeeOptionDraft(
    batchId: string,
    field: keyof NewFeeOptionDraft,
    value: string,
  ) {
    setNewFeeOptionDrafts((current) => ({
      ...current,
      [batchId]: {
        ...(current[batchId] ?? emptyNewFeeOptionDraft),
        [field]: value,
      },
    }));
  }

  function updateFeeOptionEditDraft(
    optionId: string,
    option: FeeOptionRecord,
    field: keyof FeeOptionEditDraft,
    value: string,
  ) {
    setFeeOptionEditDrafts((current) => ({
      ...current,
      [optionId]: {
        ...feeOptionEditDraft(option, current),
        [field]: value,
      },
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      {batches.length === 0 ? (
        <p className="text-base-content/70 text-sm">
          This Academy has no Batches yet. Add the first Batch to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {batches.map((batch) => {
            const batchFeeOptions = feeOptions.filter(
              (option) => option.batchId === batch.id,
            );
            const draft = newFeeOptionDrafts[batch.id] ?? emptyNewFeeOptionDraft;

            return (
              <li key={batch.id} className="card bg-base-100">
                <div className="card-body flex flex-col gap-4 py-3">
                  <form
                    className="flex flex-col gap-2"
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

                  <div className="flex flex-col gap-2">
                    <p className="text-sm">
                      {batch.isOpenForRegistration
                        ? "Open for Registration"
                        : "Closed for Registration"}
                    </p>
                    <button
                      type="button"
                      className="btn btn-neutral btn-sm self-start"
                      disabled={togglingOpenId === batch.id}
                      onClick={() => void onToggleOpen(batch)}
                    >
                      {togglingOpenId === batch.id
                        ? batch.isOpenForRegistration
                          ? "Closing…"
                          : "Opening…"
                        : batch.isOpenForRegistration
                          ? "Close for Registration"
                          : "Open for Registration"}
                    </button>
                  </div>

                  <section className="flex flex-col gap-3">
                    <h2 className="text-sm font-medium">Fee options</h2>
                    {batchFeeOptions.length === 0 ? (
                      <p className="text-base-content/70 text-sm">
                        No fee options yet. Add a package this Batch sells.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {batchFeeOptions.map((option) => {
                          const saved = feeOptionEditDraft(
                            option,
                            feeOptionEditDrafts,
                          );
                          const busy = savingFeeOptionId === option.id;

                          return (
                            <li
                              key={option.id}
                              className="rounded-box bg-base-200 flex flex-col gap-2 p-3 text-sm"
                            >
                              <p>
                                {daysCopy(option.daysPerWeek)} ·{" "}
                                {termCopy(option.termMonths)} ·{" "}
                                {formatInr(option.feePaise)}
                              </p>
                              {option.isOffered ? null : (
                                <p className="text-base-content/70">
                                  Not offered
                                </p>
                              )}
                              <form
                                className="flex flex-col gap-2"
                                onSubmit={(event) =>
                                  void onSaveFeeOption(event, batch, option)
                                }
                              >
                                <label className="flex flex-col gap-1">
                                  Label (optional)
                                  <input
                                    className="input input-bordered input-sm"
                                    value={saved.label}
                                    onChange={(event) =>
                                      updateFeeOptionEditDraft(
                                        option.id,
                                        option,
                                        "label",
                                        event.target.value,
                                      )
                                    }
                                    aria-label={`Label for ${daysCopy(option.daysPerWeek)}, ${termCopy(option.termMonths)}`}
                                  />
                                </label>
                                <label className="flex flex-col gap-1">
                                  Price (INR)
                                  <input
                                    className="input input-bordered input-sm"
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={saved.feeInr}
                                    onChange={(event) =>
                                      updateFeeOptionEditDraft(
                                        option.id,
                                        option,
                                        "feeInr",
                                        event.target.value,
                                      )
                                    }
                                    aria-label={`Price in INR for ${daysCopy(option.daysPerWeek)}, ${termCopy(option.termMonths)}`}
                                    required
                                  />
                                </label>
                                <label className="flex flex-col gap-1">
                                  Sort order
                                  <input
                                    className="input input-bordered input-sm"
                                    type="number"
                                    step={1}
                                    value={saved.sortOrder}
                                    onChange={(event) =>
                                      updateFeeOptionEditDraft(
                                        option.id,
                                        option,
                                        "sortOrder",
                                        event.target.value,
                                      )
                                    }
                                    aria-label={`Sort order for ${daysCopy(option.daysPerWeek)}, ${termCopy(option.termMonths)}`}
                                    required
                                  />
                                </label>
                                <button
                                  type="submit"
                                  className="btn btn-ghost btn-sm self-start"
                                  disabled={busy}
                                >
                                  {busy ? "Saving…" : "Save fee option"}
                                </button>
                              </form>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  disabled={busy}
                                  onClick={() =>
                                    void onToggleOffered(batch, option)
                                  }
                                >
                                  {option.isOffered
                                    ? "Stop offering"
                                    : "Offer again"}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  disabled={busy}
                                  onClick={() =>
                                    void onDeleteFeeOption(batch, option)
                                  }
                                >
                                  Delete fee option
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      className="flex flex-col gap-2"
                      onSubmit={(event) => void onAddFeeOption(event, batch)}
                    >
                      <label className="flex flex-col gap-1 text-sm">
                        Days per week
                        <input
                          className="input input-bordered"
                          type="number"
                          min={1}
                          max={7}
                          step={1}
                          value={draft.daysPerWeek}
                          onChange={(event) =>
                            updateNewFeeOptionDraft(
                              batch.id,
                              "daysPerWeek",
                              event.target.value,
                            )
                          }
                          aria-label={`Days per week for ${batch.name}`}
                          required
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm">
                        Term (months)
                        <input
                          className="input input-bordered"
                          type="number"
                          min={1}
                          step={1}
                          value={draft.termMonths}
                          onChange={(event) =>
                            updateNewFeeOptionDraft(
                              batch.id,
                              "termMonths",
                              event.target.value,
                            )
                          }
                          aria-label={`Term months for ${batch.name}`}
                          required
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm">
                        Price (INR)
                        <input
                          className="input input-bordered"
                          type="number"
                          min={1}
                          step={1}
                          value={draft.feeInr}
                          onChange={(event) =>
                            updateNewFeeOptionDraft(
                              batch.id,
                              "feeInr",
                              event.target.value,
                            )
                          }
                          aria-label={`Price in INR for ${batch.name}`}
                          required
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm">
                        Label (optional)
                        <input
                          className="input input-bordered"
                          value={draft.label}
                          onChange={(event) =>
                            updateNewFeeOptionDraft(
                              batch.id,
                              "label",
                              event.target.value,
                            )
                          }
                          aria-label={`Fee option label for ${batch.name}`}
                        />
                      </label>
                      <button
                        type="submit"
                        className="btn btn-secondary btn-sm self-start"
                        disabled={addingFeeBatchId === batch.id}
                      >
                        {addingFeeBatchId === batch.id
                          ? "Adding…"
                          : "Add fee option"}
                      </button>
                    </form>
                  </section>
                </div>
              </li>
            );
          })}
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
        <button
          type="submit"
          className="btn btn-primary self-start"
          disabled={submitting || !name.trim()}
        >
          {submitting ? "Adding…" : "Add Batch"}
        </button>
      </form>
      <ErrorToast
        key={errorId}
        message={error}
        onDismiss={dismissError}
      />
    </div>
  );
}
