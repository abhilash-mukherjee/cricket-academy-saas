"use client";

import { useCallback, useState, type FormEvent } from "react";
import type { BatchRecord } from "@/lib/batches";
import type { FeeOptionRecord } from "@/lib/batch-fee-options";
import { daysCopy, formatInr, termCopy } from "@/lib/package-copy";
import { ErrorToast } from "@/app/error-toast";
import { batchErrorCopy, feeOptionErrorCopy } from "./batch-form-copy";

type BatchEditorProps = {
  batch: BatchRecord;
  feeOptions: FeeOptionRecord[];
};

type NewFeeOptionDraft = {
  daysPerWeek: string;
  termDays: string;
  feeInr: string;
  label: string;
};

type FeeOptionEditDraft = {
  feeInr: string;
  label: string;
  sortOrder: string;
};

type OpenForm =
  | { kind: "rename" }
  | { kind: "add-fee" }
  | { kind: "edit-fee"; feeOptionId: string };

const emptyNewFeeOptionDraft: NewFeeOptionDraft = {
  daysPerWeek: "",
  termDays: "",
  feeInr: "",
  label: "",
};

function editDraft(option: FeeOptionRecord): FeeOptionEditDraft {
  return {
    feeInr: String(option.feePaise / 100),
    label: option.label ?? "",
    sortOrder: String(option.sortOrder),
  };
}

function isLastOfferedOnOpenBatch(
  batch: BatchRecord,
  option: FeeOptionRecord,
  feeOptions: FeeOptionRecord[],
): boolean {
  if (!batch.isOpenForRegistration || !option.isOffered) {
    return false;
  }
  return feeOptions.filter((item) => item.isOffered).length === 1;
}

export function BatchEditor({ batch, feeOptions }: BatchEditorProps) {
  const [openForm, setOpenForm] = useState<OpenForm | null>(null);
  const [name, setName] = useState(batch.name);
  const [newFee, setNewFee] = useState<NewFeeOptionDraft>(emptyNewFeeOptionDraft);
  const [editDrafts, setEditDrafts] = useState<Record<string, FeeOptionEditDraft>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorId, setErrorId] = useState(0);
  const dismissError = useCallback(() => setError(null), []);
  const offeredCount = feeOptions.filter((option) => option.isOffered).length;
  const stayHere = `/app/batches/${batch.id}`;

  function showError(message: string) {
    setError(message);
    setErrorId((current) => current + 1);
  }

  function rest() {
    setOpenForm(null);
    setName(batch.name);
    setNewFee(emptyNewFeeOptionDraft);
    setEditDrafts({});
    setError(null);
  }

  function openRename() {
    rest();
    setOpenForm({ kind: "rename" });
  }

  function openAddFee() {
    rest();
    setOpenForm({ kind: "add-fee" });
  }

  function openEdit(option: FeeOptionRecord) {
    rest();
    setEditDrafts({ [option.id]: editDraft(option) });
    setOpenForm({ kind: "edit-fee", feeOptionId: option.id });
  }

  async function onRename(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/batches/${batch.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      showError(batchErrorCopy(body?.error) ?? "Could not rename Batch.");
      setBusy(false);
      return;
    }
    window.location.assign(stayHere); // eslint-disable-line @next/next/no-location-assign-relative-destination
  }

  async function onToggleOpen() {
    setBusy(true);
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
      setBusy(false);
      return;
    }
    window.location.assign(stayHere); // eslint-disable-line @next/next/no-location-assign-relative-destination
  }

  async function onAddFeeOption(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/batches/${batch.id}/fee-options`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        daysPerWeek: Number(newFee.daysPerWeek),
        termDays: Number(newFee.termDays),
        feeInr: Number(newFee.feeInr),
        label: newFee.label,
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      showError(feeOptionErrorCopy(body?.error) ?? "Could not add fee option.");
      setBusy(false);
      return;
    }
    window.location.assign(stayHere); // eslint-disable-line @next/next/no-location-assign-relative-destination
  }

  async function onSaveFeeOption(event: FormEvent, option: FeeOptionRecord) {
    event.preventDefault();
    const draft = editDrafts[option.id] ?? editDraft(option);
    await patchFeeOption(
      option.id,
      {
        feeInr: Number(draft.feeInr),
        label: draft.label,
        sortOrder: Number(draft.sortOrder),
      },
      "Could not update fee option.",
    );
  }

  async function patchFeeOption(
    feeOptionId: string,
    body: Record<string, unknown>,
    fallback: string,
  ) {
    setBusy(true);
    setError(null);
    const response = await fetch(
      `/api/batches/${batch.id}/fee-options/${feeOptionId}`,
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
      setBusy(false);
      return;
    }
    window.location.assign(stayHere); // eslint-disable-line @next/next/no-location-assign-relative-destination
  }

  async function onDeleteFeeOption(option: FeeOptionRecord) {
    setBusy(true);
    setError(null);
    const response = await fetch(
      `/api/batches/${batch.id}/fee-options/${option.id}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      showError(feeOptionErrorCopy(body?.error) ?? "Could not delete fee option.");
      setBusy(false);
      return;
    }
    window.location.assign(stayHere); // eslint-disable-line @next/next/no-location-assign-relative-destination
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm">
          {batch.isOpenForRegistration
            ? "Open for Registration"
            : "Closed for Registration"}
        </p>
        {batch.isOpenForRegistration ? (
          <button
            type="button"
            className="btn btn-neutral btn-sm self-start"
            disabled={busy}
            onClick={() => void onToggleOpen()}
          >
            Close for Registration
          </button>
        ) : offeredCount === 0 ? (
          <p className="text-sm">
            Add an offered fee option before opening this Batch.
          </p>
        ) : (
          <button
            type="button"
            className="btn btn-neutral btn-sm self-start"
            disabled={busy}
            onClick={() => void onToggleOpen()}
          >
            Open for Registration
          </button>
        )}
      </div>

      {openForm?.kind === "rename" ? (
        <form className="flex flex-col gap-2" onSubmit={(event) => void onRename(event)}>
          <label className="flex flex-col gap-1 text-sm">
            Batch name
            <input
              className="input input-bordered"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label={`Rename ${batch.name}`}
              required
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-sm" disabled={busy}>
              {busy ? "Saving…" : "Rename"}
            </button>
            <button type="button" className="btn btn-sm" onClick={rest}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-sm self-start" onClick={openRename}>
          Rename Batch
        </button>
      )}

      <section className="flex flex-col gap-3">
        <h1 className="text-sm font-medium">Fee options</h1>
        {feeOptions.length === 0 ? (
          <p className="text-base-content/70 text-sm">No fee options yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {feeOptions.map((option) => {
              const editing =
                openForm?.kind === "edit-fee" &&
                openForm.feeOptionId === option.id;
              const draft = editDrafts[option.id] ?? editDraft(option);
              const withdrawHidden = isLastOfferedOnOpenBatch(
                batch,
                option,
                feeOptions,
              );
              return (
                <li
                  key={option.id}
                  className="rounded-box bg-base-200 flex flex-col gap-2 p-3 text-sm"
                >
                  {option.label ? <p className="font-medium">{option.label}</p> : null}
                  <p>
                    {daysCopy(option.daysPerWeek)} · {termCopy(option.termDays)} ·{" "}
                    {formatInr(option.feePaise)}
                  </p>
                  {option.isOffered ? null : (
                    <p className="text-base-content/70">Not offered</p>
                  )}
                  {editing ? (
                    <form
                      className="flex flex-col gap-2"
                      onSubmit={(event) => void onSaveFeeOption(event, option)}
                    >
                      <label className="flex flex-col gap-1">
                        Label (optional)
                        <input
                          className="input input-bordered input-sm"
                          value={draft.label}
                          onChange={(event) =>
                            setEditDrafts((current) => ({
                              ...current,
                              [option.id]: {
                                ...draft,
                                label: event.target.value,
                              },
                            }))
                          }
                          aria-label={`Label for ${daysCopy(option.daysPerWeek)}, ${termCopy(option.termDays)}`}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        Price (INR)
                        <input
                          className="input input-bordered input-sm"
                          type="number"
                          min={1}
                          step={1}
                          value={draft.feeInr}
                          onChange={(event) =>
                            setEditDrafts((current) => ({
                              ...current,
                              [option.id]: {
                                ...draft,
                                feeInr: event.target.value,
                              },
                            }))
                          }
                          aria-label={`Price in INR for ${daysCopy(option.daysPerWeek)}, ${termCopy(option.termDays)}`}
                          required
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        Sort order
                        <input
                          className="input input-bordered input-sm"
                          type="number"
                          step={1}
                          value={draft.sortOrder}
                          onChange={(event) =>
                            setEditDrafts((current) => ({
                              ...current,
                              [option.id]: {
                                ...draft,
                                sortOrder: event.target.value,
                              },
                            }))
                          }
                          aria-label={`Sort order for ${daysCopy(option.daysPerWeek)}, ${termCopy(option.termDays)}`}
                          required
                        />
                      </label>
                      <button
                        type="submit"
                        className="btn btn-sm self-start"
                        disabled={busy}
                      >
                        {busy ? "Saving…" : "Save fee option"}
                      </button>
                      {withdrawHidden ? (
                        <p>Close this Batch for Registration first.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={busy}
                            onClick={() =>
                              void patchFeeOption(
                                option.id,
                                { isOffered: !option.isOffered },
                                option.isOffered
                                  ? "Could not stop offering this fee option."
                                  : "Could not offer this fee option again.",
                              )
                            }
                          >
                            {option.isOffered ? "Stop offering" : "Offer again"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={busy}
                            onClick={() => void onDeleteFeeOption(option)}
                          >
                            Delete fee option
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        className="btn btn-sm self-start"
                        onClick={rest}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm self-start"
                      onClick={() => openEdit(option)}
                    >
                      Edit
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {openForm?.kind === "add-fee" ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => void onAddFeeOption(event)}
          >
            <label className="flex flex-col gap-1 text-sm">
              Days per week
              <input
                className="input input-bordered"
                type="number"
                min={1}
                max={7}
                step={1}
                value={newFee.daysPerWeek}
                onChange={(event) =>
                  setNewFee((current) => ({
                    ...current,
                    daysPerWeek: event.target.value,
                  }))
                }
                aria-label={`Days per week for ${batch.name}`}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Term (days)
              <input
                className="input input-bordered"
                type="number"
                min={1}
                step={1}
                value={newFee.termDays}
                onChange={(event) =>
                  setNewFee((current) => ({
                    ...current,
                    termDays: event.target.value,
                  }))
                }
                aria-label={`Term days for ${batch.name}`}
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
                value={newFee.feeInr}
                onChange={(event) =>
                  setNewFee((current) => ({
                    ...current,
                    feeInr: event.target.value,
                  }))
                }
                aria-label={`Price in INR for ${batch.name}`}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Label (optional)
              <input
                className="input input-bordered"
                value={newFee.label}
                onChange={(event) =>
                  setNewFee((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
                aria-label={`Fee option label for ${batch.name}`}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                className="btn btn-secondary btn-sm"
                disabled={busy}
              >
                {busy ? "Adding…" : "Add fee option"}
              </button>
              <button type="button" className="btn btn-sm" onClick={rest}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-sm self-start"
            onClick={openAddFee}
          >
            Add fee option
          </button>
        )}
      </section>
      <ErrorToast key={errorId} message={error} onDismiss={dismissError} />
    </div>
  );
}
