"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorToast } from "@/app/error-toast";
import { formatCalendarDate } from "@/lib/format-date";
import { coachWriteErrorCopy } from "./coach-form-copy";

type BatchChoice = {
  id: string;
  name: string;
};

type MonthMarks = {
  presentDates: string[];
  absentDates: string[];
};

type CoachAttendanceProps = {
  coachId: string;
  batches: BatchChoice[];
  today: string;
};

type Writing = "present" | "absent" | "clear" | null;

type MarkResult = {
  key: string;
  value: boolean | null;
};

type MonthResult =
  | { key: string; status: "ok"; value: MonthMarks }
  | { key: string; status: "error" };

function withMark(
  view: MonthMarks,
  markedOn: string,
  isPresent: boolean | null,
): MonthMarks {
  const presentDates = view.presentDates.filter((date) => date !== markedOn);
  const absentDates = view.absentDates.filter((date) => date !== markedOn);
  if (isPresent === true) {
    presentDates.push(markedOn);
    presentDates.sort();
  }
  if (isPresent === false) {
    absentDates.push(markedOn);
    absentDates.sort();
  }
  return { presentDates, absentDates };
}

function markKeyFor(batchId: string, date: string) {
  return `${batchId}:${date}`;
}

function monthKeyFor(batchId: string, month: string) {
  return `${batchId}:${month}`;
}

export function CoachAttendance({
  coachId,
  batches,
  today,
}: CoachAttendanceProps) {
  const [markDate, setMarkDate] = useState(today);
  const [markBatchId, setMarkBatchId] = useState("");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [monthBatchId, setMonthBatchId] = useState("");
  const [markResult, setMarkResult] = useState<MarkResult | null>(null);
  const [monthResult, setMonthResult] = useState<MonthResult | null>(null);
  const [writing, setWriting] = useState<Writing>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorId, setErrorId] = useState(0);
  const monthTicket = useRef(0);
  const writingLock = useRef(false);
  const dismissError = useCallback(() => setError(null), []);

  const markKey = markBatchId ? markKeyFor(markBatchId, markDate) : "";
  const monthKey = monthBatchId ? monthKeyFor(monthBatchId, month) : "";
  const mark =
    markKey && markResult?.key === markKey ? markResult.value : undefined;
  const monthMarks =
    monthKey && monthResult?.key === monthKey && monthResult.status === "ok"
      ? monthResult.value
      : null;
  const markLoading = Boolean(markBatchId) && mark === undefined;
  const monthLoading =
    Boolean(monthBatchId) &&
    (monthResult === null || monthResult.key !== monthKey);

  function showError(message: string) {
    setError(message);
    setErrorId((current) => current + 1);
  }

  useEffect(() => {
    if (!markBatchId) {
      return;
    }

    const key = markKeyFor(markBatchId, markDate);
    let cancelled = false;
    const path = `/api/coaches/${coachId}/attendance/${markBatchId}/${markDate}`;
    void (async () => {
      try {
        const response = await fetch(path);
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setMarkResult({ key, value: null });
          return;
        }
        const body = (await response.json()) as { isPresent: boolean | null };
        setMarkResult({ key, value: body.isPresent });
      } catch {
        if (!cancelled) {
          setMarkResult({ key, value: null });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coachId, markBatchId, markDate]);

  useEffect(() => {
    if (!monthBatchId) {
      return;
    }

    const key = monthKeyFor(monthBatchId, month);
    const ticket = ++monthTicket.current;
    const path = `/api/coaches/${coachId}/attendance?batchId=${monthBatchId}&month=${month}`;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(path);
        if (cancelled || ticket !== monthTicket.current) {
          return;
        }
        if (!response.ok) {
          setMonthResult({ key, status: "error" });
          return;
        }
        const body = (await response.json()) as MonthMarks;
        setMonthResult({
          key,
          status: "ok",
          value: {
            presentDates: body.presentDates,
            absentDates: body.absentDates,
          },
        });
      } catch {
        if (!cancelled && ticket === monthTicket.current) {
          setMonthResult({ key, status: "error" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coachId, monthBatchId, month]);

  async function commit(next: boolean | null) {
    if (writingLock.current || !markBatchId || mark === undefined) {
      return;
    }
    if (markDate > today || next === mark) {
      return;
    }

    writingLock.current = true;
    setWriting(next === null ? "clear" : next ? "present" : "absent");
    setError(null);

    const path = `/api/coaches/${coachId}/attendance/${markBatchId}/${markDate}`;
    let saved = false;
    try {
      const response =
        next === null
          ? await fetch(path, { method: "DELETE" })
          : await fetch(path, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ isPresent: next }),
          });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        showError(coachWriteErrorCopy(body?.error));
        return;
      }

      saved = true;
      setMarkResult({ key: markKeyFor(markBatchId, markDate), value: next });
    } catch {
      showError(coachWriteErrorCopy(null));
    } finally {
      writingLock.current = false;
      setWriting(null);
    }

    if (
      !saved ||
      monthBatchId !== markBatchId ||
      !markDate.startsWith(`${month}-`)
    ) {
      return;
    }

    const viewKey = monthKeyFor(monthBatchId, month);
    setMonthResult((current) =>
      current?.key === viewKey && current.status === "ok"
        ? {
            key: viewKey,
            status: "ok",
            value: withMark(current.value, markDate, next),
          }
        : current,
    );
    const ticket = ++monthTicket.current;
    try {
      const monthPath = `/api/coaches/${coachId}/attendance?batchId=${monthBatchId}&month=${month}`;
      const monthResponse = await fetch(monthPath);
      if (ticket !== monthTicket.current || !monthResponse.ok) {
        return;
      }
      const body = (await monthResponse.json()) as MonthMarks;
      setMonthResult({
        key: viewKey,
        status: "ok",
        value: {
          presentDates: body.presentDates,
          absentDates: body.absentDates,
        },
      });
    } catch {
      // The mark is already stored. Leave the lists that were updated in place.
    }
  }

  const busy = writing !== null;
  const markLabel =
    mark === true ? "Present" : mark === false ? "Absent" : "No mark";

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <section className="card bg-base-200 shadow">
        <div className="card-body gap-6">
          <h2 className="card-title">Mark Coach Attendance</h2>
          <fieldset className="flex flex-col gap-3" disabled={busy}>
            <label className="flex flex-col gap-1 text-sm">
              Date
              <input
                type="date"
                className="input input-bordered"
                max={today}
                value={markDate}
                onChange={(event) => setMarkDate(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Batch
              <select
                className="select select-bordered"
                value={markBatchId}
                onChange={(event) => setMarkBatchId(event.target.value)}
              >
                <option value=""></option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.name}
                  </option>
                ))}
              </select>
            </label>
            {markLoading ? (
              <div
                className="flex flex-col items-center gap-3 py-4"
                role="status"
              >
                <span className="loading loading-spinner" aria-hidden="true" />
                Loading
              </div>
            ) : null}
            {markBatchId && mark !== undefined ? (
              <div className="flex flex-col gap-3">
                <p>{markLabel}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-neutral"
                    onClick={() => void commit(true)}
                  >
                    {writing === "present" ? (
                      <span
                        className="loading loading-spinner"
                        aria-hidden="true"
                      />
                    ) : null}
                    Present
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void commit(false)}
                  >
                    {writing === "absent" ? (
                      <span
                        className="loading loading-spinner"
                        aria-hidden="true"
                      />
                    ) : null}
                    Absent
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void commit(null)}
                  >
                    {writing === "clear" ? (
                      <span
                        className="loading loading-spinner"
                        aria-hidden="true"
                      />
                    ) : null}
                    Clear
                  </button>
                </div>
              </div>
            ) : null}
          </fieldset>
        </div>
      </section>

      <section className="card bg-base-200 shadow">
        <div className="card-body gap-6">
          <h2 className="card-title">View Attendance</h2>
          <fieldset className="flex flex-col gap-3" disabled={busy}>
            <label className="flex flex-col gap-1 text-sm">
              Month
              <input
                type="month"
                className="input input-bordered"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Batch
              <select
                className="select select-bordered"
                value={monthBatchId}
                onChange={(event) => setMonthBatchId(event.target.value)}
              >
                <option value=""></option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.name}
                  </option>
                ))}
              </select>
            </label>
            {monthLoading ? (
              <div
                className="flex flex-col items-center gap-3 py-4"
                role="status"
              >
                <span className="loading loading-spinner" aria-hidden="true" />
                Loading
              </div>
            ) : null}
            {monthMarks ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <h2 className="font-medium"><b>Present Dates</b> (Total: {monthMarks.presentDates.length})</h2>
                  {/* <p> <b> Total Days:</b> {monthMarks.presentDates.length}</p> */}
                  <ul aria-label="Present dates" className="flex flex-col gap-1">
                    {monthMarks.presentDates.map((date) => (
                      <li key={date}>{formatCalendarDate(date)}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col gap-2">
                <h2 className="font-medium"><b>Absent Dates</b> (Total: {monthMarks.absentDates.length})</h2>
                  <ul aria-label="Absent dates" className="flex flex-col gap-1">
                    {monthMarks.absentDates.map((date) => (
                      <li key={date}>{formatCalendarDate(date)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </fieldset>
          <ErrorToast key={errorId} message={error} onDismiss={dismissError} />
        </div>
      </section>
    </div>
  );
}
