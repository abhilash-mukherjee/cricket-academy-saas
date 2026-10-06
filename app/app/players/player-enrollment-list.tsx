"use client";

import { useCallback, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addCalendarDays,
  calendarDaysBetween,
  pauseCoversDate,
  pauseEndExclusive,
  pauseIntervalsOverlap,
} from "@/lib/enrollment-term";
import { formatCalendarDate } from "@/lib/format-date";
import { packageFactsCopy } from "@/lib/package-copy";
import { isValidCalendarDate } from "@/lib/player-age";
import type { PlayerEnrollmentView } from "@/lib/players";
import { SuccessToast } from "@/app/success-toast";
import EnrollmentStatus from "../enrollment-status";

type PlayerEnrollmentListProps = {
  enrollments: PlayerEnrollmentView[];
  today: string;
  canMutate: boolean;
  sessionDatesByBatch: Record<string, string[]>;
};

type PauseDraft = {
  pausedOn: string;
  plannedLastPausedOn: string;
};

type PauseInterval = PlayerEnrollmentView["pauseIntervals"][number];

function emptyPauseDraft(today: string): PauseDraft {
  return { pausedOn: today, plannedLastPausedOn: "" };
}

function pauseCopy(
  pausedOn: string | null,
  plannedLastPausedOn: string | null,
): string | null {
  if (!pausedOn) {
    return null;
  }
  if (plannedLastPausedOn) {
    return `Paused ${formatCalendarDate(pausedOn)}, through ${formatCalendarDate(plannedLastPausedOn)}`;
  }
  return `Paused ${formatCalendarDate(pausedOn)}, open-ended`;
}

function pauseErrorCopy(error: string): string {
  switch (error) {
    case "lapsed":
      return "This Enrollment has lapsed and cannot be paused.";
    case "already-paused":
      return "This Enrollment is already paused.";
    case "pause-overlaps":
      return "Those dates overlap a prior pause on this Enrollment.";
    case "invalid-input":
      return "Check the pause dates and try again.";
    case "not-found":
      return "That Enrollment was not found.";
    default:
      return "Could not pause this Enrollment.";
  }
}

function resumeErrorCopy(error: string): string {
  if (error === "not-paused") {
    return "This pause already ended; valid-until was extended";
  }
  if (error === "not-found") {
    return "That Enrollment was not found.";
  }
  return "Could not resume this Enrollment.";
}

function draftOverlapsPrior(
  draft: PauseDraft,
  prior: PauseInterval[],
): boolean {
  if (!isValidCalendarDate(draft.pausedOn)) {
    return false;
  }
  const last = draft.plannedLastPausedOn.trim();
  const plannedLastPausedOn =
    last === "" ? null : isValidCalendarDate(last) ? last : null;
  if (last !== "" && plannedLastPausedOn === null) {
    return false;
  }
  const proposed = {
    start: draft.pausedOn,
    endExclusive: pauseEndExclusive({
      pausedOn: draft.pausedOn,
      plannedLastPausedOn,
      resumedOn: null,
    }),
  };
  return prior.some((pause) =>
    pauseIntervalsOverlap(proposed, {
      start: pause.pausedOn,
      endExclusive: pauseEndExclusive(pause),
    }),
  );
}

function pausePreviewCopy(
  draft: PauseDraft,
  today: string,
  validUntil: string,
  priorPauses: PauseInterval[],
): string | null {
  if (!isValidCalendarDate(draft.pausedOn)) {
    return null;
  }
  const last = draft.plannedLastPausedOn.trim();
  if (last !== "" && !isValidCalendarDate(last)) {
    return null;
  }
  if (last !== "" && last < draft.pausedOn) {
    return "Last paused day must be on or after the first paused day.";
  }
  if (draftOverlapsPrior(draft, priorPauses)) {
    return pauseErrorCopy("pause-overlaps");
  }
  if (last === "") {
    return `Open-ended from ${formatCalendarDate(draft.pausedOn)} — excluded from Session attendance until resumed.`;
  }
  if (last < today) {
    const resumedOn = addCalendarDays(last, 1);
    const daysAdded = calendarDaysBetween(draft.pausedOn, resumedOn);
    const nextUntil = addCalendarDays(validUntil, daysAdded);
    return `Settles now: Active, adds ${daysAdded} days, valid-until ${formatCalendarDate(nextUntil)}`;
  }
  return `Through ${formatCalendarDate(last)} — excluded from Session attendance.`;
}

function pauseSuccessToast(
  outcome: "paused" | "settled",
  plannedLastPausedOn: string | null,
  validUntil?: string,
): string {
  if (outcome === "settled" && validUntil) {
    return `Pause recorded — Active again, valid until ${formatCalendarDate(validUntil)}`;
  }
  if (plannedLastPausedOn) {
    return `Paused through ${formatCalendarDate(plannedLastPausedOn)} — excluded from Session attendance.`;
  }
  return "Paused open-ended — excluded from Session attendance until resumed.";
}

function draftCoversSavedSession(
  draft: PauseDraft,
  sessionDates: string[],
): boolean {
  if (!isValidCalendarDate(draft.pausedOn) || sessionDates.length === 0) {
    return false;
  }
  const last = draft.plannedLastPausedOn.trim();
  if (last !== "" && !isValidCalendarDate(last)) {
    return false;
  }
  const plannedLastPausedOn = last === "" ? null : last;
  if (plannedLastPausedOn !== null && plannedLastPausedOn < draft.pausedOn) {
    return false;
  }
  return sessionDates.some((date) =>
    pauseCoversDate(
      {
        pausedOn: draft.pausedOn,
        plannedLastPausedOn,
        resumedOn: null,
      },
      date,
    ),
  );
}

export function resumeConfirmCopy(
  pausedOn: string,
  today: string,
  storedValidUntil: string,
  shownValidUntil: string,
): string {
  const daysAdded = calendarDaysBetween(pausedOn, today);
  const nextUntil = addCalendarDays(storedValidUntil, daysAdded);
  if (nextUntil === shownValidUntil) {
    return `Adds ${daysAdded} days; valid-until unchanged`;
  }
  return `Adds ${daysAdded} days → valid-until ${formatCalendarDate(nextUntil)}`;
}

export function PlayerEnrollmentList({
  enrollments,
  today,
  canMutate,
  sessionDatesByBatch,
}: PlayerEnrollmentListProps) {
  const router = useRouter();
  const [openPauseId, setOpenPauseId] = useState<string | null>(null);
  const [openResumeId, setOpenResumeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PauseDraft>(() => emptyPauseDraft(today));
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [successId, setSuccessId] = useState(0);
  const dismissSuccess = useCallback(() => setSuccess(null), []);

  function showSuccess(message: string) {
    setSuccess(message);
    setSuccessId((current) => current + 1);
  }

  function openPause(enrollment: PlayerEnrollmentView) {
    setOpenResumeId(null);
    setOpenPauseId(enrollment.id);
    setDraft(emptyPauseDraft(today));
    setInlineError(null);
  }

  function cancelPause() {
    setOpenPauseId(null);
    setDraft(emptyPauseDraft(today));
    setInlineError(null);
  }

  function openResume(enrollmentId: string) {
    setOpenPauseId(null);
    setDraft(emptyPauseDraft(today));
    setOpenResumeId(enrollmentId);
    setInlineError(null);
  }

  function cancelResume() {
    setOpenResumeId(null);
    setInlineError(null);
  }

  async function submitPause(
    event: FormEvent,
    enrollment: PlayerEnrollmentView,
  ) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setInlineError(null);

    const plannedLastPausedOn =
      draft.plannedLastPausedOn.trim() === ""
        ? null
        : draft.plannedLastPausedOn.trim();

    try {
      const response = await fetch(`/api/enrollments/${enrollment.id}/pause`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pausedOn: draft.pausedOn,
          plannedLastPausedOn,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setInlineError(pauseErrorCopy(payload?.error ?? "invalid-input"));
        setSubmitting(false);
        return;
      }

      const body = (await response.json()) as
        | {
            ok: true;
            outcome: "paused";
            pausedOn: string;
            plannedLastPausedOn: string | null;
          }
        | {
            ok: true;
            outcome: "settled";
            daysAdded: number;
            validUntil: string;
          };

      cancelPause();
      if (body.outcome === "settled") {
        showSuccess(pauseSuccessToast("settled", null, body.validUntil));
      } else {
        showSuccess(pauseSuccessToast("paused", body.plannedLastPausedOn));
      }
      router.refresh();
      setSubmitting(false);
    } catch {
      setInlineError(pauseErrorCopy("invalid-input"));
      setSubmitting(false);
    }
  }

  async function submitResume(enrollment: PlayerEnrollmentView) {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setInlineError(null);

    try {
      const response = await fetch(
        `/api/enrollments/${enrollment.id}/resume`,
        { method: "POST" },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        const code = payload?.error ?? "not-paused";
        setInlineError(resumeErrorCopy(code));
        if (code === "not-paused") {
          setOpenResumeId(null);
          router.refresh();
        }
        setSubmitting(false);
        return;
      }

      const body = (await response.json()) as {
        ok: true;
        daysAdded: number;
        validUntil: string;
      };
      cancelResume();
      showSuccess(
        `Resumed — added ${body.daysAdded} days, valid until ${formatCalendarDate(body.validUntil)}`,
      );
      router.refresh();
      setSubmitting(false);
    } catch {
      setInlineError(resumeErrorCopy("invalid-input"));
      setSubmitting(false);
    }
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {enrollments.map((enrollment) => {
          const pauseOpen = openPauseId === enrollment.id;
          const resumeOpen = openResumeId === enrollment.id;
          const preview = pauseOpen
            ? pausePreviewCopy(
                draft,
                today,
                enrollment.effectiveValidUntil,
                enrollment.pauseIntervals,
              )
            : null;
          const pauseBlocked =
            preview === pauseErrorCopy("pause-overlaps") ||
            (preview !== null && preview.startsWith("Last paused day"));
          const savedAttendanceStays =
            pauseOpen &&
            draftCoversSavedSession(
              draft,
              sessionDatesByBatch[enrollment.batchId] ?? [],
            );

          return (
            <li key={enrollment.id} className="card bg-base-100">
              <div className="card-body gap-1 py-3">
                <Link
                  className="link font-medium"
                  href={`/app/batches/${enrollment.batchId}`}
                >
                  {enrollment.batchName}
                </Link>
                <EnrollmentStatus
                  status={enrollment.status}
                  startsLater={enrollment.startsLater}
                />
                <p>
                  {packageFactsCopy({
                    daysPerWeek: enrollment.daysPerWeek,
                    termDays: enrollment.termDays,
                    feePaise: enrollment.feePaisePaid,
                  })}
                </p>
                <p>Valid from {formatCalendarDate(enrollment.validFrom)}</p>
                <p>
                  Valid until{" "}
                  {formatCalendarDate(enrollment.effectiveValidUntil)}
                </p>
                {enrollment.startsLater && enrollment.plannedLastPausedOn ? (
                  <p>
                    First day{" "}
                    {formatCalendarDate(
                      addCalendarDays(enrollment.plannedLastPausedOn, 1),
                    )}
                  </p>
                ) : enrollment.status === "paused" ? (
                  <p>
                    {pauseCopy(
                      enrollment.pausedOn,
                      enrollment.plannedLastPausedOn,
                    )}
                  </p>
                ) : null}
                {enrollment.continuesPreviousTerm ? (
                  <p>This term continues the previous one.</p>
                ) : null}

                {canMutate ? (
                  <div className="flex flex-col gap-2 pt-1">
                    {enrollment.status === "active" && !pauseOpen ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline self-start"
                        onClick={() => openPause(enrollment)}
                      >
                        Pause
                      </button>
                    ) : null}

                    {enrollment.status === "paused" && !resumeOpen ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline self-start"
                        onClick={() => openResume(enrollment.id)}
                      >
                        Resume
                      </button>
                    ) : null}

                    {pauseOpen ? (
                      <form
                        className="flex flex-col gap-2"
                        onSubmit={(event) =>
                          void submitPause(event, enrollment)
                        }
                      >
                        <label className="flex flex-col gap-1 text-sm">
                          First paused day
                          <input
                            type="date"
                            className="input input-bordered input-sm"
                            min={enrollment.validFrom}
                            max={today}
                            value={draft.pausedOn}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                pausedOn: event.target.value,
                              }))
                            }
                            required
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-sm">
                          Last paused day (optional)
                          <input
                            type="date"
                            className="input input-bordered input-sm"
                            min={draft.pausedOn || enrollment.validFrom}
                            value={draft.plannedLastPausedOn}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                plannedLastPausedOn: event.target.value,
                              }))
                            }
                          />
                        </label>
                {preview ? (
                          <p
                            className={
                              pauseBlocked ? "text-error text-sm" : "text-sm"
                            }
                          >
                            {preview}
                          </p>
                        ) : null}
                        {savedAttendanceStays ? (
                          <p className="text-sm">
                            Attendance already saved on days in this pause stays
                            as it was.
                          </p>
                        ) : null}
                        {inlineError && openPauseId === enrollment.id ? (
                          <p className="text-error text-sm">{inlineError}</p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            className="btn btn-sm btn-primary"
                            disabled={submitting || pauseBlocked}
                          >
                            Save pause
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={cancelPause}
                            disabled={submitting}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : null}

                    {resumeOpen && enrollment.pausedOn ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm">
                          {resumeConfirmCopy(
                            enrollment.pausedOn,
                            today,
                            enrollment.validUntil,
                            enrollment.effectiveValidUntil,
                          )}
                        </p>
                        {inlineError && openResumeId === enrollment.id ? (
                          <p className="text-error text-sm">{inlineError}</p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            disabled={submitting}
                            onClick={() => void submitResume(enrollment)}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            disabled={submitting}
                            onClick={cancelResume}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <SuccessToast
        key={successId}
        message={success}
        onDismiss={dismissSuccess}
      />
    </>
  );
}