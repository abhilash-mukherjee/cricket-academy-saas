"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { BatchRecord } from "@/lib/batches";
import type { FeeOptionRecord } from "@/lib/batch-fee-options";
import { lastCoveredDay } from "@/lib/enrollment-term";
import { formatCalendarDate } from "@/lib/format-date";
import { packageFactsCopy } from "@/lib/package-copy";
import {
  isPlayerUnder18,
  isValidCalendarDate,
} from "@/lib/player-age";
import type { PlayerMatchPreview } from "@/lib/players";
import { SuccessToast } from "@/app/success-toast";

export type ManualAddBatchOption = Pick<BatchRecord, "id" | "name">;
export type ManualAddFeeOption = Pick<
  FeeOptionRecord,
  | "id"
  | "batchId"
  | "daysPerWeek"
  | "termDays"
  | "feePaise"
  | "label"
  | "isOffered"
  | "sortOrder"
>;

type DirectoryMode = {
  mode: "directory";
};

type DetailMode = {
  mode: "detail";
  playerId: string;
  playerName: string;
};

type ManualAddFormProps = (DirectoryMode | DetailMode) & {
  batches: ManualAddBatchOption[];
  feeOptions: ManualAddFeeOption[];
  today: string;
};

type Draft = {
  playerFullName: string;
  playerDateOfBirth: string;
  guardianFullName: string;
  guardianPhone: string;
  playerPhone: string;
  contactEmail: string;
  batchId: string;
  batchFeeOptionId: string;
  validFrom: string;
};

function emptyDraft(today: string): Draft {
  return {
    playerFullName: "",
    playerDateOfBirth: "",
    guardianFullName: "",
    guardianPhone: "",
    playerPhone: "",
    contactEmail: "",
    batchId: "",
    batchFeeOptionId: "",
    validFrom: today,
  };
}

export function manualAddErrorCopy(error: string): string {
  switch (error) {
    case "overlaps":
      return "This term overlaps an Enrollment for this Player on this Batch.";
    case "paused":
      return "An Enrollment for this Player on this Batch is paused.";
    case "starts-later":
      return "This Player starts later on this Batch.";
    case "term-not-covering-today":
      return "That term would not cover today.";
    case "invalid-input":
      return "Check the form and try again.";
    case "not-found":
      return "That Batch or fee option was not found.";
    default:
      return "Could not add this Player.";
  }
}

function usableBatches(
  batches: ManualAddBatchOption[],
  feeOptions: ManualAddFeeOption[],
): ManualAddBatchOption[] {
  const batchIds = new Set(feeOptions.map((option) => option.batchId));
  return batches.filter((batch) => batchIds.has(batch.id));
}

function optionsForBatch(
  feeOptions: ManualAddFeeOption[],
  batchId: string,
): { offered: ManualAddFeeOption[]; stopped: ManualAddFeeOption[] } {
  const forBatch = feeOptions
    .filter((option) => option.batchId === batchId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    offered: forBatch.filter((option) => option.isOffered),
    stopped: forBatch.filter((option) => !option.isOffered),
  };
}

function optionLabel(option: ManualAddFeeOption): string {
  const facts = packageFactsCopy(option);
  return option.label ? `${option.label} — ${facts}` : facts;
}

function contactPhoneForMatch(draft: Draft): string {
  if (!isValidCalendarDate(draft.playerDateOfBirth)) {
    return "";
  }
  if (isPlayerUnder18(draft.playerDateOfBirth)) {
    return draft.guardianPhone.trim();
  }
  return draft.playerPhone.trim();
}

function matchLookupKey(
  mode: ManualAddFormProps["mode"],
  open: boolean,
  draft: Draft,
): string | null {
  if (mode !== "directory" || !open) {
    return null;
  }
  const fullName = draft.playerFullName.trim();
  const phone = contactPhoneForMatch(draft);
  if (!fullName || !phone) {
    return null;
  }
  return `${fullName}\u0000${phone}`;
}

function parseMatchLookupKey(key: string): { fullName: string; phone: string } {
  const separator = key.indexOf("\u0000");
  return {
    fullName: key.slice(0, separator),
    phone: key.slice(separator + 1),
  };
}

export function ManualAddForm(props: ManualAddFormProps) {
  const { batches, feeOptions, today } = props;
  const router = useRouter();
  const usable = useMemo(
    () => usableBatches(batches, feeOptions),
    [batches, feeOptions],
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(today));
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [successId, setSuccessId] = useState(0);
  const [fetchedMatch, setFetchedMatch] = useState<{
    key: string;
    match: PlayerMatchPreview | null;
  } | null>(null);
  const dismissSuccess = useCallback(() => setSuccess(null), []);
  const matchQueryKey = matchLookupKey(props.mode, open, draft);
  const match =
    fetchedMatch && matchQueryKey && fetchedMatch.key === matchQueryKey
      ? fetchedMatch.match
      : null;

  const ctaLabel = props.mode === "directory" ? "Add Player" : "Add Enrollment";
  const submitLabel =
    props.mode === "directory" ? "Add Player" : "Add Enrollment";

  const selectedOptions = draft.batchId
    ? optionsForBatch(feeOptions, draft.batchId)
    : { offered: [], stopped: [] };
  const selectedFee = feeOptions.find(
    (option) => option.id === draft.batchFeeOptionId,
  );
  const coversThrough =
    selectedFee && isValidCalendarDate(draft.validFrom)
      ? lastCoveredDay(draft.validFrom, selectedFee.termDays)
      : null;
  const termMissesToday = coversThrough !== null && coversThrough < today;
  const dobReady = isValidCalendarDate(draft.playerDateOfBirth);
  const under18 = dobReady && isPlayerUnder18(draft.playerDateOfBirth);

  useEffect(() => {
    if (!matchQueryKey) {
      return;
    }
    const { fullName, phone } = parseMatchLookupKey(matchQueryKey);
    const key = matchQueryKey;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams({ fullName, phone });
      void fetch(`/api/players/match?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            return;
          }
          const body = (await response.json()) as {
            match: PlayerMatchPreview | null;
          };
          setFetchedMatch({ key, match: body.match });
        })
        .catch(() => {
          /* aborted or network — ignore */
        });
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [matchQueryKey]);

  function showSuccess(message: string) {
    setSuccess(message);
    setSuccessId((current) => current + 1);
  }

  function collapseAndClear() {
    setOpen(false);
    setDraft(emptyDraft(today));
    setInlineError(null);
    setFetchedMatch(null);
  }

  function openForm() {
    setDraft(emptyDraft(today));
    setInlineError(null);
    setFetchedMatch(null);
    setOpen(true);
  }

  function onBatchChange(batchId: string) {
    setDraft((current) => ({
      ...current,
      batchId,
      batchFeeOptionId: "",
    }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (usable.length === 0 || termMissesToday || submitting) {
      return;
    }
    setSubmitting(true);
    setInlineError(null);

    const body =
      props.mode === "detail"
        ? {
            playerId: props.playerId,
            batchId: draft.batchId,
            batchFeeOptionId: draft.batchFeeOptionId,
            validFrom: draft.validFrom,
          }
        : {
            playerFullName: draft.playerFullName,
            playerDateOfBirth: draft.playerDateOfBirth,
            guardianFullName: under18 ? draft.guardianFullName : null,
            guardianPhone: under18 ? draft.guardianPhone : null,
            playerPhone: under18 ? null : draft.playerPhone,
            contactEmail: draft.contactEmail.trim() || null,
            batchId: draft.batchId,
            batchFeeOptionId: draft.batchFeeOptionId,
            validFrom: draft.validFrom,
          };

    try {
      const response = await fetch("/api/players", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        const code = payload?.error ?? "invalid-input";
        setInlineError(manualAddErrorCopy(code));
        setSubmitting(false);
        return;
      }

      const name =
        props.mode === "detail"
          ? props.playerName
          : draft.playerFullName.trim() || "Player";
      collapseAndClear();
      showSuccess(
        props.mode === "directory"
          ? `Added ${name}.`
          : `Added Enrollment for ${name}.`,
      );
      router.refresh();
      setSubmitting(false);
    } catch {
      setInlineError(manualAddErrorCopy("invalid-input"));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {open ? null : (
        <button
          type="button"
          className="btn btn-neutral self-start"
          onClick={openForm}
        >
          {ctaLabel}
        </button>
      )}

      {open ? (
        usable.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p>Add a fee option on a Batch first.</p>
            <button
              type="button"
              className="btn btn-ghost self-start"
              onClick={collapseAndClear}
            >
              Cancel
            </button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => void onSubmit(event)}
          >
            {props.mode === "directory" ? (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  Full name
                  <input
                    className="input input-bordered"
                    value={draft.playerFullName}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        playerFullName: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Date of birth
                  <input
                    type="date"
                    className="input input-bordered"
                    max={today}
                    value={draft.playerDateOfBirth}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        playerDateOfBirth: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                {dobReady ? (
                  under18 ? (
                    <>
                      <label className="flex flex-col gap-1 text-sm">
                        Guardian full name
                        <input
                          className="input input-bordered"
                          value={draft.guardianFullName}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              guardianFullName: event.target.value,
                            }))
                          }
                          required
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm">
                        Guardian phone
                        <input
                          className="input input-bordered"
                          value={draft.guardianPhone}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              guardianPhone: event.target.value,
                            }))
                          }
                          required
                        />
                      </label>
                    </>
                  ) : (
                    <label className="flex flex-col gap-1 text-sm">
                      Player phone
                      <input
                        className="input input-bordered"
                        value={draft.playerPhone}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            playerPhone: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                  )
                ) : null}
                <label className="flex flex-col gap-1 text-sm">
                  Email (optional)
                  <input
                    type="email"
                    className="input input-bordered"
                    value={draft.contactEmail}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        contactEmail: event.target.value,
                      }))
                    }
                  />
                </label>
                {match ? (
                  <p>
                    Links to existing Player: {match.fullName} · {match.phone}
                  </p>
                ) : null}
                {match &&
                dobReady &&
                match.dateOfBirth !== draft.playerDateOfBirth ? (
                  <p className="text-error">
                    Existing Player DOB is{" "}
                    {formatCalendarDate(match.dateOfBirth)}; this form has{" "}
                    {formatCalendarDate(draft.playerDateOfBirth)} — existing
                    values will be kept
                  </p>
                ) : null}
              </>
            ) : null}

            <label className="flex flex-col gap-1 text-sm">
              Batch
              <select
                className="select select-bordered"
                value={draft.batchId}
                onChange={(event) => onBatchChange(event.target.value)}
                required
              >
                <option value="">Choose a Batch</option>
                {usable.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Fee option
              <select
                className="select select-bordered"
                value={draft.batchFeeOptionId}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    batchFeeOptionId: event.target.value,
                  }))
                }
                required
                disabled={!draft.batchId}
              >
                <option value="">Choose a fee option</option>
                {selectedOptions.offered.length > 0 ? (
                  <optgroup label="Offered">
                    {selectedOptions.offered.map((option) => (
                      <option key={option.id} value={option.id}>
                        {optionLabel(option)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {selectedOptions.stopped.length > 0 ? (
                  <optgroup label="Not offered / previously offered">
                    {selectedOptions.stopped.map((option) => (
                      <option key={option.id} value={option.id}>
                        {optionLabel(option)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Starts
              <input
                type="date"
                className="input input-bordered"
                value={draft.validFrom}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    validFrom: event.target.value,
                  }))
                }
                required
              />
            </label>
            {coversThrough ? (
              <p>Covers through {formatCalendarDate(coversThrough)}</p>
            ) : null}
            {termMissesToday ? (
              <p>That term would not cover today.</p>
            ) : null}
            {inlineError ? (
              <p role="alert" className="text-error text-sm">
                {inlineError}
              </p>
            ) : null}

            <div className="flex gap-2">
              <button
                type="submit"
                className="btn btn-neutral"
                disabled={
                  submitting ||
                  termMissesToday ||
                  !draft.batchId ||
                  !draft.batchFeeOptionId
                }
              >
                {submitting ? "Saving…" : submitLabel}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={submitting}
                onClick={collapseAndClear}
              >
                Cancel
              </button>
            </div>
          </form>
        )
      ) : null}

      <SuccessToast
        key={successId}
        message={success}
        onDismiss={dismissSuccess}
      />
    </div>
  );
}
