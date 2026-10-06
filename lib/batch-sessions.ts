import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  batchSessionAttendance,
  batchSessions,
  batches,
  enrollmentPauses,
  enrollments,
  players,
} from "@/db/domain-schema";
import { getDb, getTransactionalDb } from "@/db/client";
import { settleFinishedPauses } from "@/lib/enrollments";
import {
  logWarning,
  logInfo,
} from "@/lib/request-trace";
import {
  addCalendarDays,
  calendarDaysBetween,
  pauseCoversDate,
} from "@/lib/enrollment-term";
import { calendarDateInIst, isValidCalendarDate } from "@/lib/player-age";
import { PLAYERS_PER_PAGE } from "@/lib/players";
import { postgresConstraint } from "@/lib/postgres-constraint";

type OwnerTx = Parameters<
  Parameters<ReturnType<typeof getTransactionalDb>["transaction"]>[0]
>[0];

type Reader = OwnerTx | ReturnType<typeof getDb>;

const SESSION_UNIQUE = "batch_sessions_academy_id_batch_id_session_date_unique";

const saveBodySchema = z.object({
  playerIds: z.array(z.uuid()),
  presentPlayerIds: z.array(z.uuid()),
});

export type AttendancePlayer = {
  playerId: string;
  fullName: string;
  phone: string;
  isPresent: boolean;
};

export type AttendanceSnapshot = {
  saved: boolean;
  pausedPlayersOmitted: boolean;
  deferredStartsOmitted: boolean;
  players: AttendancePlayer[];
};

export type SessionAttendance = AttendanceSnapshot & {
  batchName: string;
};

export type SavedSession = {
  sessionDate: string;
  presentCount: number;
  listedCount: number;
};

export type SavedSessionList = {
  batchName: string;
  sessions: SavedSession[];
  page: number;
  total: number;
};

export type SessionCommandError =
  | "invalid-input"
  | "not-found"
  | "stale-list"
  | "session-date";

export type SessionCommandResult =
  | ({ ok: true } & AttendanceSnapshot)
  | { ok: false; error: SessionCommandError };

type PauseRow = {
  pausedOn: string;
  plannedLastPausedOn: string | null;
  resumedOn: string | null;
  isDeferred: boolean;
};

type Bundle = {
  enrollmentId: string;
  playerId: string;
  fullName: string;
  phone: string;
  validFrom: string;
  validUntil: string;
  pauses: PauseRow[];
};

type EligiblePlayer = {
  playerId: string;
  enrollmentId: string;
  fullName: string;
  phone: string;
};

class SessionFailure extends Error {
  constructor(readonly code: SessionCommandError) {
    super(code);
  }
}

function byNameThenId(
  left: { fullName: string; playerId: string },
  right: { fullName: string; playerId: string },
): number {
  if (left.fullName < right.fullName) {
    return -1;
  }
  if (left.fullName > right.fullName) {
    return 1;
  }
  if (left.playerId < right.playerId) {
    return -1;
  }
  if (left.playerId > right.playerId) {
    return 1;
  }
  return 0;
}

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const values = new Set(left);
  return right.every((id) => values.has(id));
}

function uniqueIds(ids: string[]): boolean {
  return new Set(ids).size === ids.length;
}

function coversDate(
  validFrom: string,
  validUntil: string,
  date: string,
): boolean {
  return validFrom <= date && date <= validUntil;
}

function settleInMemory(
  bundle: Bundle,
  today: string,
): { validUntil: string; pauses: PauseRow[] } {
  let validUntil = bundle.validUntil;
  const pauses = bundle.pauses.map((pause) => ({ ...pause }));
  for (const pause of pauses) {
    if (pause.resumedOn !== null) {
      continue;
    }
    if (
      pause.plannedLastPausedOn === null ||
      pause.plannedLastPausedOn >= today
    ) {
      continue;
    }
    const resumedOn = addCalendarDays(pause.plannedLastPausedOn, 1);
    validUntil = addCalendarDays(
      validUntil,
      calendarDaysBetween(pause.pausedOn, resumedOn),
    );
    pause.resumedOn = resumedOn;
  }
  return { validUntil, pauses };
}

function eligiblePlayers(
  bundles: Bundle[],
  sessionDate: string,
  today: string,
): {
  players: EligiblePlayer[];
  pausedPlayersOmitted: boolean;
  deferredStartsOmitted: boolean;
} {
  const chosen = new Map<string, EligiblePlayer>();
  const pausedPlayerIds = new Set<string>();
  const deferredPlayerIds = new Set<string>();

  for (const bundle of bundles) {
    const settled = settleInMemory(bundle, today);
    const covering = settled.pauses.filter((pause) =>
      pauseCoversDate(pause, sessionDate),
    );
    if (covering.some((pause) => pause.isDeferred)) {
      deferredPlayerIds.add(bundle.playerId);
    }
    if (covering.some((pause) => !pause.isDeferred)) {
      pausedPlayerIds.add(bundle.playerId);
    }
    if (
      covering.length > 0 ||
      !coversDate(bundle.validFrom, settled.validUntil, sessionDate)
    ) {
      continue;
    }
    chosen.set(bundle.playerId, {
      playerId: bundle.playerId,
      enrollmentId: bundle.enrollmentId,
      fullName: bundle.fullName,
      phone: bundle.phone,
    });
  }

  return {
    players: [...chosen.values()].sort(byNameThenId),
    pausedPlayersOmitted: [...pausedPlayerIds].some((id) => !chosen.has(id)),
    deferredStartsOmitted: [...deferredPlayerIds].some(
      (id) => !chosen.has(id),
    ),
  };
}

function bundlesFrom(
  rows: {
    enrollmentId: string;
    playerId: string;
    fullName: string;
    phone: string;
    validFrom: string;
    validUntil: string;
    pausedOn: string | null;
    plannedLastPausedOn: string | null;
    resumedOn: string | null;
    isDeferred: boolean | null;
  }[],
): Bundle[] {
  const map = new Map<string, Bundle>();
  for (const row of rows) {
    let bundle = map.get(row.enrollmentId);
    if (!bundle) {
      bundle = {
        enrollmentId: row.enrollmentId,
        playerId: row.playerId,
        fullName: row.fullName,
        phone: row.phone,
        validFrom: row.validFrom,
        validUntil: row.validUntil,
        pauses: [],
      };
      map.set(row.enrollmentId, bundle);
    }
    if (row.pausedOn) {
      bundle.pauses.push({
        pausedOn: row.pausedOn,
        plannedLastPausedOn: row.plannedLastPausedOn,
        resumedOn: row.resumedOn,
        isDeferred: row.isDeferred === true,
      });
    }
  }
  return [...map.values()];
}

async function findBatch(db: Reader, academyId: string, batchId: string) {
  const [batch] = await db
    .select({ id: batches.id, name: batches.name })
    .from(batches)
    .where(and(eq(batches.id, batchId), eq(batches.academyId, academyId)))
    .limit(1);
  return batch ?? null;
}

async function loadBundles(
  db: Reader,
  academyId: string,
  batchId: string,
): Promise<Bundle[]> {
  const rows = await db
    .select({
      enrollmentId: enrollments.id,
      playerId: players.id,
      fullName: players.fullName,
      phone: players.phone,
      validFrom: enrollments.validFrom,
      validUntil: enrollments.validUntil,
      pausedOn: enrollmentPauses.pausedOn,
      plannedLastPausedOn: enrollmentPauses.plannedLastPausedOn,
      resumedOn: enrollmentPauses.resumedOn,
      isDeferred: enrollmentPauses.isDeferred,
    })
    .from(enrollments)
    .innerJoin(
      players,
      and(
        eq(players.id, enrollments.playerId),
        eq(players.academyId, academyId),
      ),
    )
    .leftJoin(
      enrollmentPauses,
      and(
        eq(enrollmentPauses.enrollmentId, enrollments.id),
        eq(enrollmentPauses.academyId, academyId),
      ),
    )
    .where(
      and(
        eq(enrollments.academyId, academyId),
        eq(enrollments.batchId, batchId),
      ),
    );
  return bundlesFrom(rows);
}

async function findSession(
  db: Reader,
  academyId: string,
  batchId: string,
  sessionDate: string,
) {
  const [session] = await db
    .select({ id: batchSessions.id })
    .from(batchSessions)
    .where(
      and(
        eq(batchSessions.academyId, academyId),
        eq(batchSessions.batchId, batchId),
        eq(batchSessions.sessionDate, sessionDate),
      ),
    )
    .limit(1);
  return session ?? null;
}

async function loadStored(
  db: Reader,
  academyId: string,
  batchSessionId: string,
): Promise<AttendancePlayer[]> {
  const rows = await db
    .select({
      playerId: batchSessionAttendance.playerId,
      fullName: players.fullName,
      phone: players.phone,
      isPresent: batchSessionAttendance.isPresent,
    })
    .from(batchSessionAttendance)
    .innerJoin(
      players,
      and(
        eq(players.id, batchSessionAttendance.playerId),
        eq(players.academyId, academyId),
      ),
    )
    .where(
      and(
        eq(batchSessionAttendance.batchSessionId, batchSessionId),
        eq(batchSessionAttendance.academyId, academyId),
      ),
    );
  return rows.sort(byNameThenId);
}

function unmarked(playersOnList: EligiblePlayer[]): AttendancePlayer[] {
  return playersOnList.map((player) => ({
    playerId: player.playerId,
    fullName: player.fullName,
    phone: player.phone,
    isPresent: false,
  }));
}

function clampPage(total: number, page: number): number {
  if (total === 0) {
    return 1;
  }
  const pageCount = Math.ceil(total / PLAYERS_PER_PAGE);
  return Math.min(Math.max(page, 1), pageCount);
}

async function settleBatch(
  tx: OwnerTx,
  academyId: string,
  batchId: string,
  today: string,
) {
  const rows = await tx
    .select({
      id: enrollments.id,
      validFrom: enrollments.validFrom,
      validUntil: enrollments.validUntil,
    })
    .from(enrollments)
    .where(
      and(eq(enrollments.academyId, academyId), eq(enrollments.batchId, batchId)),
    );
  for (const enrollment of rows) {
    await settleFinishedPauses(tx, academyId, enrollment, today);
  }
}

function assertSessionDate(date: string, today: string) {
  if (!isValidCalendarDate(date) || date > today) {
    throw new SessionFailure("session-date");
  }
}

/** Eligible list when no Session is saved; stored rows when one is. Opening a date does not write. */
export async function getSessionAttendance(
  academyId: string,
  batchId: string,
  sessionDate: string,
  today: string,
): Promise<SessionAttendance | null> {
  const db = getDb();
  const batch = await findBatch(db, academyId, batchId);
  if (!batch) {
    return null;
  }

  const session = await findSession(db, academyId, batchId, sessionDate);
  if (session) {
    return {
      batchName: batch.name,
      saved: true,
      pausedPlayersOmitted: false,
      deferredStartsOmitted: false,
      players: await loadStored(db, academyId, session.id),
    };
  }

  const eligible = eligiblePlayers(
    await loadBundles(db, academyId, batchId),
    sessionDate,
    today,
  );
  return {
    batchName: batch.name,
    saved: false,
    pausedPlayersOmitted: eligible.pausedPlayersOmitted,
    deferredStartsOmitted: eligible.deferredStartsOmitted,
    players: unmarked(eligible.players),
  };
}

export async function listSavedSessions(
  academyId: string,
  batchId: string,
  page: number,
): Promise<SavedSessionList | null> {
  const db = getDb();
  const batch = await findBatch(db, academyId, batchId);
  if (!batch) {
    return null;
  }

  const rows = await db
    .select({
      id: batchSessions.id,
      sessionDate: batchSessions.sessionDate,
    })
    .from(batchSessions)
    .where(
      and(
        eq(batchSessions.academyId, academyId),
        eq(batchSessions.batchId, batchId),
      ),
    )
    .orderBy(desc(batchSessions.sessionDate));

  const total = rows.length;
  const currentPage = clampPage(total, page);
  const slice = rows.slice(
    (currentPage - 1) * PLAYERS_PER_PAGE,
    currentPage * PLAYERS_PER_PAGE,
  );
  const ids = slice.map((session) => session.id);
  const marks =
    ids.length === 0
      ? []
      : await db
          .select({
            batchSessionId: batchSessionAttendance.batchSessionId,
            isPresent: batchSessionAttendance.isPresent,
          })
          .from(batchSessionAttendance)
          .where(
            and(
              eq(batchSessionAttendance.academyId, academyId),
              inArray(batchSessionAttendance.batchSessionId, ids),
            ),
          );

  return {
    batchName: batch.name,
    page: currentPage,
    total,
    sessions: slice.map((session) => {
      const attendance = marks.filter(
        (mark) => mark.batchSessionId === session.id,
      );
      return {
        sessionDate: session.sessionDate,
        presentCount: attendance.filter((mark) => mark.isPresent).length,
        listedCount: attendance.length,
      };
    }),
  };
}

export async function listBatchSessionDates(
  academyId: string,
  batchIds: string[],
): Promise<Record<string, string[]>> {
  const dates: Record<string, string[]> = {};
  if (batchIds.length === 0) {
    return dates;
  }
  const db = getDb();
  const rows = await db
    .select({
      batchId: batchSessions.batchId,
      sessionDate: batchSessions.sessionDate,
    })
    .from(batchSessions)
    .where(
      and(
        eq(batchSessions.academyId, academyId),
        inArray(batchSessions.batchId, batchIds),
      ),
    );
  for (const row of rows) {
    const list = dates[row.batchId] ?? [];
    list.push(row.sessionDate);
    dates[row.batchId] = list;
  }
  return dates;
}

export async function saveSessionAttendance(
  academyId: string,
  batchId: string,
  sessionDate: string,
  input: unknown,
  today: string = calendarDateInIst(),
  retried = false,
): Promise<SessionCommandResult> {
  const parsed = saveBodySchema.safeParse(input);
  if (
    !parsed.success ||
    !uniqueIds(parsed.data.playerIds) ||
    !uniqueIds(parsed.data.presentPlayerIds)
  ) {
    logWarning(
      `Session attendance was not saved with ID: ${batchId} on ${sessionDate}.`,
      "invalid-input",
    );
    return { ok: false, error: "invalid-input" };
  }

  const { playerIds, presentPlayerIds } = parsed.data;
  const listed = new Set(playerIds);
  if (!presentPlayerIds.every((id) => listed.has(id))) {
    logWarning(
      `Session attendance was not saved with ID: ${batchId} on ${sessionDate}.`,
      "invalid-input",
    );
    return { ok: false, error: "invalid-input" };
  }

  const db = getTransactionalDb();
  let sessionId: string | null = null;
  try {
    const result = await db.transaction(async (tx) => {
      const batch = await findBatch(tx, academyId, batchId);
      if (!batch) {
        throw new SessionFailure("not-found");
      }
      assertSessionDate(sessionDate, today);

      await settleBatch(tx, academyId, batchId, today);
      const present = new Set(presentPlayerIds);
      const session = await findSession(tx, academyId, batchId, sessionDate);

      if (session) {
        const stored = await tx
          .select({
            id: batchSessionAttendance.id,
            playerId: batchSessionAttendance.playerId,
            fullName: players.fullName,
            phone: players.phone,
          })
          .from(batchSessionAttendance)
          .innerJoin(
            players,
            and(
              eq(players.id, batchSessionAttendance.playerId),
              eq(players.academyId, academyId),
            ),
          )
          .where(
            and(
              eq(batchSessionAttendance.batchSessionId, session.id),
              eq(batchSessionAttendance.academyId, academyId),
            ),
          );

        if (!sameSet(stored.map((row) => row.playerId), playerIds)) {
          throw new SessionFailure("stale-list");
        }

        sessionId = session.id;
        for (const row of stored) {
          await tx
            .update(batchSessionAttendance)
            .set({ isPresent: present.has(row.playerId) })
            .where(
              and(
                eq(batchSessionAttendance.id, row.id),
                eq(batchSessionAttendance.academyId, academyId),
              ),
            );
        }

        return {
          ok: true as const,
          saved: true,
          pausedPlayersOmitted: false,
          deferredStartsOmitted: false,
          players: stored
            .map((row) => ({
              playerId: row.playerId,
              fullName: row.fullName,
              phone: row.phone,
              isPresent: present.has(row.playerId),
            }))
            .sort(byNameThenId),
        };
      }

      const eligible = eligiblePlayers(
        await loadBundles(tx, academyId, batchId),
        sessionDate,
        today,
      );
      if (!sameSet(eligible.players.map((player) => player.playerId), playerIds)) {
        throw new SessionFailure("stale-list");
      }

      const [created] = await tx
        .insert(batchSessions)
        .values({ academyId, batchId, sessionDate })
        .returning({ id: batchSessions.id });

      sessionId = created.id;
      if (eligible.players.length > 0) {
        await tx.insert(batchSessionAttendance).values(
          eligible.players.map((player) => ({
            academyId,
            batchSessionId: created.id,
            playerId: player.playerId,
            enrollmentId: player.enrollmentId,
            isPresent: present.has(player.playerId),
          })),
        );
      }

      return {
        ok: true as const,
        saved: true,
        pausedPlayersOmitted: false,
        deferredStartsOmitted: false,
        players: eligible.players.map((player) => ({
          playerId: player.playerId,
          fullName: player.fullName,
          phone: player.phone,
          isPresent: present.has(player.playerId),
        })),
      };
    });
    logInfo(
      `Session attendance saved successfully with ID: ${sessionId}.`,
    );
    return result;
  } catch (error) {
    if (error instanceof SessionFailure) {
      logWarning(
        `Session attendance was not saved with ID: ${batchId} on ${sessionDate}.`,
        error.code,
      );
      return { ok: false, error: error.code };
    }
    if (postgresConstraint(error) === SESSION_UNIQUE) {
      if (retried) {
        logWarning(
          `Session attendance was not saved with ID: ${batchId} on ${sessionDate}.`,
          "stale-list",
        );
        return { ok: false, error: "stale-list" };
      }
      return saveSessionAttendance(
        academyId,
        batchId,
        sessionDate,
        input,
        today,
        true,
      );
    }
    throw error;
  }
}

export async function discardSession(
  academyId: string,
  batchId: string,
  sessionDate: string,
  today: string = calendarDateInIst(),
): Promise<SessionCommandResult> {
  const db = getTransactionalDb();
  let sessionId: string | null = null;
  try {
    const result = await db.transaction(async (tx) => {
      const batch = await findBatch(tx, academyId, batchId);
      if (!batch) {
        throw new SessionFailure("not-found");
      }
      assertSessionDate(sessionDate, today);

      const session = await findSession(tx, academyId, batchId, sessionDate);
      if (!session) {
        throw new SessionFailure("not-found");
      }

      sessionId = session.id;
      await settleBatch(tx, academyId, batchId, today);
      await tx
        .delete(batchSessionAttendance)
        .where(
          and(
            eq(batchSessionAttendance.batchSessionId, session.id),
            eq(batchSessionAttendance.academyId, academyId),
          ),
        );
      await tx
        .delete(batchSessions)
        .where(
          and(
            eq(batchSessions.id, session.id),
            eq(batchSessions.academyId, academyId),
          ),
        );

      const eligible = eligiblePlayers(
        await loadBundles(tx, academyId, batchId),
        sessionDate,
        today,
      );
      return {
        ok: true as const,
        saved: false,
        pausedPlayersOmitted: eligible.pausedPlayersOmitted,
        deferredStartsOmitted: eligible.deferredStartsOmitted,
        players: unmarked(eligible.players),
      };
    });
    logInfo(
      `Session discarded successfully with ID: ${sessionId}.`,
    );
    return result;
  } catch (error) {
    if (error instanceof SessionFailure) {
      logWarning(
        `Session was not discarded with ID: ${batchId} on ${sessionDate}.`,
        error.code,
      );
      return { ok: false, error: error.code };
    }
    throw error;
  }
}
