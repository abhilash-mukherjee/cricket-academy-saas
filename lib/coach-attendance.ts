import { and, asc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { batches, coachAttendance, coaches } from "@/db/domain-schema";
import { getDb } from "@/db/client";
import { calendarDateInIst, isValidCalendarDate } from "@/lib/player-age";
import { postgresConstraint } from "@/lib/postgres-constraint";
import { logInfo, logWarning } from "@/lib/request-trace";

const MARK_UNIQUE = "coach_attendance_academy_coach_batch_day_unique";

const markBodySchema = z.object({
  isPresent: z.boolean(),
});

export type CoachAttendanceError =
  | "invalid-input"
  | "future-date"
  | "not-found";

export type CoachAttendanceCommandResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: CoachAttendanceError };

export type CoachAttendanceMarkResult =
  | { ok: true; isPresent: boolean | null }
  | { ok: false; error: CoachAttendanceError };

export type CoachAttendanceMonth = {
  presentDates: string[];
  absentDates: string[];
  presentCount: number;
  absentCount: number;
};

export type CoachAttendanceMonthResult =
  | ({ ok: true } & CoachAttendanceMonth)
  | { ok: false; error: CoachAttendanceError };

const calendarDateSchema = z.string().refine(isValidCalendarDate);

const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .refine((month) => isValidCalendarDate(`${month}-01`));

function isUuid(value: string): boolean {
  return z.uuid().safeParse(value).success;
}

function nextMonthStart(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextYear = monthNumber === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

async function coachAndBatchExist(
  academyId: string,
  coachId: string,
  batchId: string,
): Promise<boolean> {
  const db = getDb();
  const [coach, batch] = await Promise.all([
    db
      .select({ id: coaches.id })
      .from(coaches)
      .where(and(eq(coaches.id, coachId), eq(coaches.academyId, academyId)))
      .limit(1),
    db
      .select({ id: batches.id })
      .from(batches)
      .where(and(eq(batches.id, batchId), eq(batches.academyId, academyId)))
      .limit(1),
  ]);
  return coach.length > 0 && batch.length > 0;
}

function invalidIds(
  coachId: string,
  batchId: string,
): { ok: false; error: "invalid-input" } | null {
  if (!isUuid(coachId) || !isUuid(batchId)) {
    return { ok: false, error: "invalid-input" };
  }
  return null;
}

async function findMark(
  academyId: string,
  coachId: string,
  batchId: string,
  markedOn: string,
): Promise<boolean | null> {
  const db = getDb();
  const [row] = await db
    .select({ isPresent: coachAttendance.isPresent })
    .from(coachAttendance)
    .where(
      and(
        eq(coachAttendance.academyId, academyId),
        eq(coachAttendance.coachId, coachId),
        eq(coachAttendance.batchId, batchId),
        eq(coachAttendance.markedOn, markedOn),
      ),
    )
    .limit(1);
  return row?.isPresent ?? null;
}

export async function getCoachAttendance(
  academyId: string,
  coachId: string,
  batchId: string,
  markedOn: string,
): Promise<CoachAttendanceMarkResult> {
  const ids = invalidIds(coachId, batchId);
  if (ids) {
    return ids;
  }
  if (!calendarDateSchema.safeParse(markedOn).success) {
    return { ok: false, error: "invalid-input" };
  }
  if (!(await coachAndBatchExist(academyId, coachId, batchId))) {
    return { ok: false, error: "not-found" };
  }

  const isPresent = await findMark(academyId, coachId, batchId, markedOn);
  return { ok: true, isPresent };
}

export async function getCoachAttendanceMonth(
  academyId: string,
  coachId: string,
  batchId: string,
  month: string,
): Promise<CoachAttendanceMonthResult> {
  const ids = invalidIds(coachId, batchId);
  if (ids) {
    return ids;
  }
  if (!monthSchema.safeParse(month).success) {
    return { ok: false, error: "invalid-input" };
  }
  if (!(await coachAndBatchExist(academyId, coachId, batchId))) {
    return { ok: false, error: "not-found" };
  }

  const db = getDb();
  const rows = await db
    .select({
      markedOn: coachAttendance.markedOn,
      isPresent: coachAttendance.isPresent,
    })
    .from(coachAttendance)
    .where(
      and(
        eq(coachAttendance.academyId, academyId),
        eq(coachAttendance.coachId, coachId),
        eq(coachAttendance.batchId, batchId),
        gte(coachAttendance.markedOn, `${month}-01`),
        lt(coachAttendance.markedOn, nextMonthStart(month)),
      ),
    )
    .orderBy(asc(coachAttendance.markedOn));

  const presentDates: string[] = [];
  const absentDates: string[] = [];
  for (const row of rows) {
    if (row.isPresent) {
      presentDates.push(row.markedOn);
    } else {
      absentDates.push(row.markedOn);
    }
  }

  return {
    ok: true,
    presentDates,
    absentDates,
    presentCount: presentDates.length,
    absentCount: absentDates.length,
  };
}

export async function markCoachAttendance(
  academyId: string,
  coachId: string,
  batchId: string,
  markedOn: string,
  input: unknown,
  today: string = calendarDateInIst(),
): Promise<CoachAttendanceCommandResult> {
  const ids = invalidIds(coachId, batchId);
  if (ids) {
    logWarning(
      `Coach attendance was not marked with ID: ${coachId}.`,
      "invalid-input",
      { batchId, markedOn },
    );
    return ids;
  }
  if (!calendarDateSchema.safeParse(markedOn).success) {
    logWarning(
      `Coach attendance was not marked with ID: ${coachId}.`,
      "invalid-input",
      { batchId, markedOn },
    );
    return { ok: false, error: "invalid-input" };
  }

  const parsed = markBodySchema.safeParse(input);
  if (!parsed.success) {
    logWarning(
      `Coach attendance was not marked with ID: ${coachId}.`,
      "invalid-input",
      { batchId, markedOn },
    );
    return { ok: false, error: "invalid-input" };
  }

  if (!(await coachAndBatchExist(academyId, coachId, batchId))) {
    logWarning(
      `Coach attendance was not marked with ID: ${coachId}.`,
      "not-found",
      { batchId, markedOn },
    );
    return { ok: false, error: "not-found" };
  }

  if (markedOn > today) {
    logWarning(
      `Coach attendance was not marked with ID: ${coachId}.`,
      "future-date",
      { batchId, markedOn },
    );
    return { ok: false, error: "future-date" };
  }

  const isPresent = parsed.data.isPresent;
  const stored = await findMark(academyId, coachId, batchId, markedOn);
  if (stored === isPresent) {
    logInfo(`Coach attendance was already marked with ID: ${coachId}.`, {
      batchId,
      markedOn,
      changed: false,
    });
    return { ok: true, changed: false };
  }

  const db = getDb();
  try {
    if (stored === null) {
      await db.insert(coachAttendance).values({
        academyId,
        coachId,
        batchId,
        markedOn,
        isPresent,
      });
    } else {
      await db
        .update(coachAttendance)
        .set({ isPresent })
        .where(
          and(
            eq(coachAttendance.academyId, academyId),
            eq(coachAttendance.coachId, coachId),
            eq(coachAttendance.batchId, batchId),
            eq(coachAttendance.markedOn, markedOn),
          ),
        );
    }
  } catch (error) {
    if (postgresConstraint(error) !== MARK_UNIQUE) {
      throw error;
    }
    const again = await findMark(academyId, coachId, batchId, markedOn);
    if (again === isPresent) {
      logInfo(`Coach attendance was already marked with ID: ${coachId}.`, {
        batchId,
        markedOn,
        changed: false,
      });
      return { ok: true, changed: false };
    }
    if (again === null) {
      await db.insert(coachAttendance).values({
        academyId,
        coachId,
        batchId,
        markedOn,
        isPresent,
      });
    } else {
      const updated = await db
        .update(coachAttendance)
        .set({ isPresent })
        .where(
          and(
            eq(coachAttendance.academyId, academyId),
            eq(coachAttendance.coachId, coachId),
            eq(coachAttendance.batchId, batchId),
            eq(coachAttendance.markedOn, markedOn),
          ),
        )
        .returning({ id: coachAttendance.id });
      if (updated.length === 0) {
        await db.insert(coachAttendance).values({
          academyId,
          coachId,
          batchId,
          markedOn,
          isPresent,
        });
      }
    }
  }

  logInfo(`Coach attendance marked successfully with ID: ${coachId}.`, {
    batchId,
    markedOn,
    changed: true,
  });
  return { ok: true, changed: true };
}

export async function clearCoachAttendance(
  academyId: string,
  coachId: string,
  batchId: string,
  markedOn: string,
  today: string = calendarDateInIst(),
): Promise<CoachAttendanceCommandResult> {
  const ids = invalidIds(coachId, batchId);
  if (ids) {
    logWarning(
      `Coach attendance was not cleared with ID: ${coachId}.`,
      "invalid-input",
      { batchId, markedOn },
    );
    return ids;
  }
  if (!calendarDateSchema.safeParse(markedOn).success) {
    logWarning(
      `Coach attendance was not cleared with ID: ${coachId}.`,
      "invalid-input",
      { batchId, markedOn },
    );
    return { ok: false, error: "invalid-input" };
  }
  if (!(await coachAndBatchExist(academyId, coachId, batchId))) {
    logWarning(
      `Coach attendance was not cleared with ID: ${coachId}.`,
      "not-found",
      { batchId, markedOn },
    );
    return { ok: false, error: "not-found" };
  }
  if (markedOn > today) {
    logWarning(
      `Coach attendance was not cleared with ID: ${coachId}.`,
      "future-date",
      { batchId, markedOn },
    );
    return { ok: false, error: "future-date" };
  }

  const db = getDb();
  const deleted = await db
    .delete(coachAttendance)
    .where(
      and(
        eq(coachAttendance.academyId, academyId),
        eq(coachAttendance.coachId, coachId),
        eq(coachAttendance.batchId, batchId),
        eq(coachAttendance.markedOn, markedOn),
      ),
    )
    .returning({ id: coachAttendance.id });

  const changed = deleted.length > 0;
  logInfo(
    changed
      ? `Coach attendance cleared successfully with ID: ${coachId}.`
      : `Coach attendance was already clear with ID: ${coachId}.`,
    { batchId, markedOn, changed },
  );
  return { ok: true, changed };
}
