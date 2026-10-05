import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { enrollmentPauses, enrollments } from "@/db/domain-schema";
import { getTransactionalDb } from "@/db/client";
import {
  addCalendarDays,
  calendarDaysBetween,
  pauseEndExclusive,
  pauseIntervalsOverlap,
  rangesShareADay,
} from "@/lib/enrollment-term";
import {
  calendarDateInIst,
  isValidCalendarDate,
} from "@/lib/player-age";
import {
  logWarning,
  logInfo,
} from "@/lib/request-trace";

type OwnerTx = Parameters<
  Parameters<ReturnType<typeof getTransactionalDb>["transaction"]>[0]
>[0];

export type EnrollmentBlock = "overlaps" | "paused";

export type TermStatus = "active" | "paused" | "lapsed";

export type OpenPause = {
  pausedOn: string;
  plannedLastPausedOn: string | null;
};

export type EnrollmentTerm = {
  status: TermStatus;
  effectiveValidUntil: string;
  pausedOn: string | null;
  plannedLastPausedOn: string | null;
};

export type PauseError =
  | "invalid-input"
  | "not-found"
  | "lapsed"
  | "already-paused"
  | "pause-overlaps";

export type PauseResult =
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
    }
  | { ok: false; error: PauseError };

export type ResumeError = "not-found" | "not-paused";

export type ResumeResult =
  | { ok: true; daysAdded: number; validUntil: string }
  | { ok: false; error: ResumeError };

class PauseFailure extends Error {
  constructor(readonly code: PauseError) {
    super(code);
  }
}

class ResumeFailure extends Error {
  constructor(readonly code: ResumeError) {
    super(code);
  }
}

const pauseBodySchema = z.object({
  pausedOn: z.iso.date(),
  plannedLastPausedOn: z.union([z.iso.date(), z.null()]),
});

/** Read-only term. A finished dated pause extends valid-until in memory and is not written. */
export function enrollmentTerm(
  enrollment: { validUntil: string },
  openPause: OpenPause | null,
  today: string,
): EnrollmentTerm {
  if (!openPause) {
    return {
      status: enrollment.validUntil >= today ? "active" : "lapsed",
      effectiveValidUntil: enrollment.validUntil,
      pausedOn: null,
      plannedLastPausedOn: null,
    };
  }

  const finished =
    openPause.plannedLastPausedOn !== null &&
    openPause.plannedLastPausedOn < today;
  if (finished) {
    const resumedOn = addCalendarDays(openPause.plannedLastPausedOn!, 1);
    const pausedDays = calendarDaysBetween(openPause.pausedOn, resumedOn);
    const effectiveValidUntil = addCalendarDays(
      enrollment.validUntil,
      pausedDays,
    );
    return {
      status: effectiveValidUntil >= today ? "active" : "lapsed",
      effectiveValidUntil,
      pausedOn: null,
      plannedLastPausedOn: null,
    };
  }

  const coversToday =
    openPause.pausedOn <= today &&
    (openPause.plannedLastPausedOn === null ||
      today <= openPause.plannedLastPausedOn);
  if (coversToday) {
    return {
      status: "paused",
      effectiveValidUntil: enrollment.validUntil,
      pausedOn: openPause.pausedOn,
      plannedLastPausedOn: openPause.plannedLastPausedOn,
    };
  }

  return {
    status: enrollment.validUntil >= today ? "active" : "lapsed",
    effectiveValidUntil: enrollment.validUntil,
    pausedOn: null,
    plannedLastPausedOn: null,
  };
}

export async function guardNewEnrollment(
  tx: OwnerTx,
  input: {
    academyId: string;
    playerId: string;
    batchId: string;
    validFrom: string;
    validUntil: string;
    today: string;
  },
): Promise<EnrollmentBlock | null> {
  const existing = await tx
    .select({
      id: enrollments.id,
      validFrom: enrollments.validFrom,
      validUntil: enrollments.validUntil,
    })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.academyId, input.academyId),
        eq(enrollments.playerId, input.playerId),
        eq(enrollments.batchId, input.batchId),
      ),
    );

  const ranges: { validFrom: string; validUntil: string; open: boolean }[] =
    [];

  for (const enrollment of existing) {
    const settled = await settleFinishedPauses(
      tx,
      input.academyId,
      enrollment,
      input.today,
    );
    ranges.push(settled);
  }

  if (ranges.some((range) => range.open)) {
    return "paused";
  }

  const overlaps = ranges.some((range) =>
    rangesShareADay(
      input.validFrom,
      input.validUntil,
      range.validFrom,
      range.validUntil,
    ),
  );
  return overlaps ? "overlaps" : null;
}

export async function settleFinishedPauses(
  tx: OwnerTx,
  academyId: string,
  enrollment: { id: string; validFrom: string; validUntil: string },
  today: string,
): Promise<{ validFrom: string; validUntil: string; open: boolean }> {
  const openPauses = await tx
    .select({
      id: enrollmentPauses.id,
      pausedOn: enrollmentPauses.pausedOn,
      plannedLastPausedOn: enrollmentPauses.plannedLastPausedOn,
    })
    .from(enrollmentPauses)
    .where(
      and(
        eq(enrollmentPauses.academyId, academyId),
        eq(enrollmentPauses.enrollmentId, enrollment.id),
        isNull(enrollmentPauses.resumedOn),
      ),
    );

  let validUntil = enrollment.validUntil;
  let open = false;

  for (const pause of openPauses) {
    const finished =
      pause.plannedLastPausedOn !== null && pause.plannedLastPausedOn < today;
    if (!finished) {
      open = true;
      continue;
    }

    const resumedOn = addCalendarDays(pause.plannedLastPausedOn!, 1);
    const pausedDays = calendarDaysBetween(pause.pausedOn, resumedOn);
    validUntil = addCalendarDays(validUntil, pausedDays);
    await tx
      .update(enrollmentPauses)
      .set({ resumedOn })
      .where(
        and(
          eq(enrollmentPauses.id, pause.id),
          eq(enrollmentPauses.academyId, academyId),
        ),
      );
    await tx
      .update(enrollments)
      .set({ validUntil })
      .where(
        and(eq(enrollments.id, enrollment.id), eq(enrollments.academyId, academyId)),
      );
  }

  return { validFrom: enrollment.validFrom, validUntil, open };
}

export async function insertEnrollment(
  tx: OwnerTx,
  input: {
    academyId: string;
    playerId: string;
    batchId: string;
    registrationId: string | null;
    daysPerWeek: number;
    termDays: number;
    feePaisePaid: number;
    validFrom: string;
    validUntil: string;
  },
): Promise<void> {
  await tx.insert(enrollments).values({
    academyId: input.academyId,
    playerId: input.playerId,
    batchId: input.batchId,
    registrationId: input.registrationId,
    daysPerWeek: input.daysPerWeek,
    termDays: input.termDays,
    feePaisePaid: input.feePaisePaid,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    renewedFromEnrollmentId: null,
  });
}

export async function pauseEnrollment(
  academyId: string,
  enrollmentId: string,
  input: unknown,
  today: string = calendarDateInIst(),
): Promise<PauseResult> {
  const parsed = pauseBodySchema.safeParse(input);
  if (
    !parsed.success ||
    !isValidCalendarDate(parsed.data.pausedOn) ||
    (parsed.data.plannedLastPausedOn !== null &&
      !isValidCalendarDate(parsed.data.plannedLastPausedOn))
  ) {
    logWarning(
      `Enrollment was not paused with ID: ${enrollmentId}.`,
      "invalid-input",
    );
    return { ok: false, error: "invalid-input" };
  }

  const { pausedOn, plannedLastPausedOn } = parsed.data;
  if (pausedOn > today) {
    logWarning(
      `Enrollment was not paused with ID: ${enrollmentId}.`,
      "invalid-input",
    );
    return { ok: false, error: "invalid-input" };
  }
  if (plannedLastPausedOn !== null && plannedLastPausedOn < pausedOn) {
    logWarning(
      `Enrollment was not paused with ID: ${enrollmentId}.`,
      "invalid-input",
    );
    return { ok: false, error: "invalid-input" };
  }

  const db = getTransactionalDb();
  try {
    const result = await db.transaction(async (tx) => {
      const [enrollment] = await tx
        .select({
          id: enrollments.id,
          validFrom: enrollments.validFrom,
          validUntil: enrollments.validUntil,
        })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.id, enrollmentId),
            eq(enrollments.academyId, academyId),
          ),
        )
        .limit(1);

      if (!enrollment) {
        throw new PauseFailure("not-found");
      }
      if (pausedOn < enrollment.validFrom) {
        throw new PauseFailure("invalid-input");
      }

      const settled = await settleFinishedPauses(
        tx,
        academyId,
        enrollment,
        today,
      );

      const openPauseRows = await tx
        .select({
          pausedOn: enrollmentPauses.pausedOn,
          plannedLastPausedOn: enrollmentPauses.plannedLastPausedOn,
        })
        .from(enrollmentPauses)
        .where(
          and(
            eq(enrollmentPauses.academyId, academyId),
            eq(enrollmentPauses.enrollmentId, enrollment.id),
            isNull(enrollmentPauses.resumedOn),
          ),
        );

      const openPause = openPauseRows[0] ?? null;
      const term = enrollmentTerm(
        { validUntil: settled.validUntil },
        openPause,
        today,
      );

      if (term.status === "lapsed") {
        throw new PauseFailure("lapsed");
      }
      if (term.status === "paused") {
        throw new PauseFailure("already-paused");
      }

      const existingPauses = await tx
        .select({
          pausedOn: enrollmentPauses.pausedOn,
          plannedLastPausedOn: enrollmentPauses.plannedLastPausedOn,
          resumedOn: enrollmentPauses.resumedOn,
        })
        .from(enrollmentPauses)
        .where(
          and(
            eq(enrollmentPauses.academyId, academyId),
            eq(enrollmentPauses.enrollmentId, enrollment.id),
          ),
        );

      const proposed = {
        start: pausedOn,
        endExclusive: pauseEndExclusive({
          pausedOn,
          plannedLastPausedOn,
          resumedOn: null,
        }),
      };
      const overlapsPrior = existingPauses.some((pause) =>
        pauseIntervalsOverlap(proposed, {
          start: pause.pausedOn,
          endExclusive: pauseEndExclusive(pause),
        }),
      );
      if (overlapsPrior) {
        throw new PauseFailure("pause-overlaps");
      }

      const settlesImmediately =
        plannedLastPausedOn !== null && plannedLastPausedOn < today;

      if (settlesImmediately) {
        const resumedOn = addCalendarDays(plannedLastPausedOn, 1);
        const daysAdded = calendarDaysBetween(pausedOn, resumedOn);
        const validUntil = addCalendarDays(settled.validUntil, daysAdded);
        await tx.insert(enrollmentPauses).values({
          academyId,
          enrollmentId: enrollment.id,
          pausedOn,
          plannedLastPausedOn,
          resumedOn,
        });
        await tx
          .update(enrollments)
          .set({ validUntil })
          .where(
            and(
              eq(enrollments.id, enrollment.id),
              eq(enrollments.academyId, academyId),
            ),
          );
        return {
          ok: true as const,
          outcome: "settled" as const,
          daysAdded,
          validUntil,
        };
      }

      await tx.insert(enrollmentPauses).values({
        academyId,
        enrollmentId: enrollment.id,
        pausedOn,
        plannedLastPausedOn,
        resumedOn: null,
      });
      return {
        ok: true as const,
        outcome: "paused" as const,
        pausedOn,
        plannedLastPausedOn,
      };
    });
    logInfo(
      result.outcome === "settled"
        ? `Enrollment settled with ID: ${enrollmentId}.`
        : `Enrollment paused with ID: ${enrollmentId}.`,
    );
    return result;
  } catch (error) {
    if (error instanceof PauseFailure) {
      logWarning(
        `Enrollment was not paused with ID: ${enrollmentId}.`,
        error.code,
      );
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function resumeEnrollment(
  academyId: string,
  enrollmentId: string,
  today: string = calendarDateInIst(),
): Promise<ResumeResult> {
  const db = getTransactionalDb();
  try {
    const result = await db.transaction(async (tx) => {
      const [enrollment] = await tx
        .select({
          id: enrollments.id,
          validFrom: enrollments.validFrom,
          validUntil: enrollments.validUntil,
        })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.id, enrollmentId),
            eq(enrollments.academyId, academyId),
          ),
        )
        .limit(1);

      if (!enrollment) {
        throw new ResumeFailure("not-found");
      }

      const settled = await settleFinishedPauses(
        tx,
        academyId,
        enrollment,
        today,
      );

      const [openPause] = await tx
        .select({
          id: enrollmentPauses.id,
          pausedOn: enrollmentPauses.pausedOn,
          plannedLastPausedOn: enrollmentPauses.plannedLastPausedOn,
        })
        .from(enrollmentPauses)
        .where(
          and(
            eq(enrollmentPauses.academyId, academyId),
            eq(enrollmentPauses.enrollmentId, enrollment.id),
            isNull(enrollmentPauses.resumedOn),
          ),
        )
        .limit(1);

      if (!openPause) {
        throw new ResumeFailure("not-paused");
      }

      const term = enrollmentTerm(
        { validUntil: settled.validUntil },
        openPause,
        today,
      );
      if (term.status !== "paused") {
        throw new ResumeFailure("not-paused");
      }

      const daysAdded = calendarDaysBetween(openPause.pausedOn, today);
      const validUntil = addCalendarDays(settled.validUntil, daysAdded);
      await tx
        .update(enrollmentPauses)
        .set({ resumedOn: today })
        .where(
          and(
            eq(enrollmentPauses.id, openPause.id),
            eq(enrollmentPauses.academyId, academyId),
          ),
        );
      await tx
        .update(enrollments)
        .set({ validUntil })
        .where(
          and(
            eq(enrollments.id, enrollment.id),
            eq(enrollments.academyId, academyId),
          ),
        );

      return { ok: true as const, daysAdded, validUntil };
    });
    logInfo(
      `Enrollment resumed successfully with ID: ${enrollmentId}.`,
    );
    return result;
  } catch (error) {
    if (error instanceof ResumeFailure) {
      logWarning(
        `Enrollment was not resumed with ID: ${enrollmentId}.`,
        error.code,
      );
      return { ok: false, error: error.code };
    }
    throw error;
  }
}
