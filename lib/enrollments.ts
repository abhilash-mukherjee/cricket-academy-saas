import { and, eq, isNull } from "drizzle-orm";
import { enrollmentPauses, enrollments } from "@/db/domain-schema";
import type { getTransactionalDb } from "@/db/client";
import {
  addCalendarDays,
  calendarDaysBetween,
  rangesShareADay,
} from "@/lib/enrollment-term";

type OwnerTx = Parameters<
  Parameters<ReturnType<typeof getTransactionalDb>["transaction"]>[0]
>[0];

export type EnrollmentBlock = "overlaps" | "paused";

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

async function settleFinishedPauses(
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
    registrationId: string;
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
