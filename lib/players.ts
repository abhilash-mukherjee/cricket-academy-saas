import { and, asc, eq, ilike, inArray, isNull, like, sql } from "drizzle-orm";
import {
  batches,
  enrollmentPauses,
  enrollments,
  players,
} from "@/db/domain-schema";
import { getDb, type getTransactionalDb } from "@/db/client";
import { enrollmentTerm, type TermStatus } from "@/lib/enrollments";

export type { TermStatus };
import { normalizeRequiredPhone } from "@/lib/phone";
import { postgresConstraint } from "@/lib/postgres-constraint";

export const PLAYERS_PER_PAGE = 20;

export type DirectoryLine = {
  batchId: string;
  batchName: string;
  status: TermStatus;
  validFrom: string;
};

export type DirectoryPlayer = {
  id: string;
  fullName: string;
  phone: string;
  lines: DirectoryLine[];
};

export type PlayerList = {
  players: DirectoryPlayer[];
  page: number;
  total: number;
};

export type RosterPlayer = {
  id: string;
  fullName: string;
  phone: string;
  status: "active" | "paused";
  pausedOn: string | null;
  plannedLastPausedOn: string | null;
};

export type BatchRoster = {
  batchName: string;
  players: RosterPlayer[];
  page: number;
  total: number;
};

export type PlayerEnrollmentView = {
  id: string;
  batchId: string;
  batchName: string;
  status: TermStatus;
  daysPerWeek: number;
  termDays: number;
  feePaisePaid: number;
  validFrom: string;
  effectiveValidUntil: string;
  pausedOn: string | null;
  plannedLastPausedOn: string | null;
  continuesPreviousTerm: boolean;
};

export type PlayerDetail = {
  id: string;
  fullName: string;
  phone: string;
  dateOfBirth: string;
  guardianFullName: string | null;
  enrollments: PlayerEnrollmentView[];
};

type OwnerTx = Parameters<
  Parameters<ReturnType<typeof getTransactionalDb>["transaction"]>[0]
>[0];

const PLAYER_IDENTITY = "players_academy_id_full_name_normalized_phone_unique";

export type PlayerIntake = {
  fullName: string;
  fullNameNormalized: string;
  phone: string;
  dateOfBirth: string;
  guardianFullName: string | null;
  guardianPhone: string | null;
};

function intakeGuardian(intake: PlayerIntake): {
  guardianFullName: string;
  guardianPhone: string;
} | null {
  if (!intake.guardianFullName || !intake.guardianPhone) {
    return null;
  }
  return {
    guardianFullName: intake.guardianFullName,
    guardianPhone: intake.guardianPhone,
  };
}

export async function findOrCreatePlayer(
  tx: OwnerTx,
  academyId: string,
  intake: PlayerIntake,
): Promise<string> {
  const existing = await findPlayer(tx, academyId, intake);
  const guardian = intakeGuardian(intake);

  if (existing) {
    if (!existing.guardianFullName && !existing.guardianPhone && guardian) {
      await tx
        .update(players)
        .set(guardian)
        .where(
          and(eq(players.id, existing.id), eq(players.academyId, academyId)),
        );
    }
    return existing.id;
  }

  try {
    const [created] = await tx
      .insert(players)
      .values({
        academyId,
        fullName: intake.fullName,
        fullNameNormalized: intake.fullNameNormalized,
        phone: intake.phone,
        dateOfBirth: intake.dateOfBirth,
        guardianFullName: guardian?.guardianFullName ?? null,
        guardianPhone: guardian?.guardianPhone ?? null,
      })
      .returning({ id: players.id });
    return created.id;
  } catch (error) {
    if (postgresConstraint(error) !== PLAYER_IDENTITY) {
      throw error;
    }
    const raced = await findPlayer(tx, academyId, intake);
    if (!raced) {
      throw error;
    }
    if (!raced.guardianFullName && !raced.guardianPhone && guardian) {
      await tx
        .update(players)
        .set(guardian)
        .where(and(eq(players.id, raced.id), eq(players.academyId, academyId)));
    }
    return raced.id;
  }
}

function playerSearch(q: string) {
  const trimmed = q.trim();
  if (!trimmed) {
    return null;
  }
  const phone = normalizeRequiredPhone(trimmed);
  if (phone.ok) {
    return eq(players.phone, phone.phone);
  }
  if (/^\d+$/.test(trimmed)) {
    return like(players.phone, `%${trimmed}`);
  }
  const pattern = `%${trimmed.replace(/[\\%_]/g, "\\$&")}%`;
  return ilike(players.fullName, pattern);
}

function directoryLines(
  rows: {
    batchId: string;
    batchName: string;
    validFrom: string;
    status: TermStatus;
  }[],
): DirectoryLine[] {
  const visible = rows.filter(
    (row) => row.status === "active" || row.status === "paused",
  );
  const chosen =
    visible.length > 0
      ? visible
      : rows.filter((row) => row.status === "lapsed").slice(0, 1);
  return chosen.map((row) => ({
    batchId: row.batchId,
    batchName: row.batchName,
    status: row.status,
    validFrom: row.validFrom,
  }));
}

export async function listPlayerDirectory(
  academyId: string,
  input: { q: string; page: number; today: string },
): Promise<PlayerList> {
  const db = getDb();
  const search = playerSearch(input.q);
  const where = search
    ? and(eq(players.academyId, academyId), search)
    : eq(players.academyId, academyId);

  const matched = await db
    .select({
      id: players.id,
      fullName: players.fullName,
      phone: players.phone,
    })
    .from(players)
    .where(where)
    .orderBy(asc(players.fullName), asc(players.id));

  const total = matched.length;
  const pageCount = Math.max(1, Math.ceil(total / PLAYERS_PER_PAGE));
  const page = total === 0 ? 1 : Math.min(Math.max(input.page, 1), pageCount);
  const slice = matched.slice(
    (page - 1) * PLAYERS_PER_PAGE,
    page * PLAYERS_PER_PAGE,
  );
  const ids = slice.map((player) => player.id);
  const enrollmentRows =
    ids.length === 0
      ? []
      : await db
          .select({
            playerId: enrollments.playerId,
            batchId: enrollments.batchId,
            batchName: batches.name,
            validFrom: enrollments.validFrom,
            validUntil: enrollments.validUntil,
            pausedOn: enrollmentPauses.pausedOn,
            plannedLastPausedOn: enrollmentPauses.plannedLastPausedOn,
          })
          .from(enrollments)
          .innerJoin(
            batches,
            and(
              eq(batches.id, enrollments.batchId),
              eq(batches.academyId, academyId),
            ),
          )
          .leftJoin(
            enrollmentPauses,
            and(
              eq(enrollmentPauses.enrollmentId, enrollments.id),
              eq(enrollmentPauses.academyId, academyId),
              isNull(enrollmentPauses.resumedOn),
            ),
          )
          .where(
            and(
              eq(enrollments.academyId, academyId),
              inArray(enrollments.playerId, ids),
            ),
          )
          .orderBy(sql`${enrollments.validFrom} desc`, asc(enrollments.id));

  return {
    page,
    total,
    players: slice.map((player) => ({
      id: player.id,
      fullName: player.fullName,
      phone: player.phone,
      lines: directoryLines(
        enrollmentRows
          .filter((row) => row.playerId === player.id)
          .map((row) => {
            const term = enrollmentTerm(
              { validUntil: row.validUntil },
              row.pausedOn
                ? {
                    pausedOn: row.pausedOn,
                    plannedLastPausedOn: row.plannedLastPausedOn,
                  }
                : null,
              input.today,
            );
            return {
              batchId: row.batchId,
              batchName: row.batchName,
              validFrom: row.validFrom,
              status: term.status,
            };
          }),
      ),
    })),
  };
}

function clampPage(total: number, page: number): number {
  if (total === 0) {
    return 1;
  }
  const pageCount = Math.ceil(total / PLAYERS_PER_PAGE);
  return Math.min(Math.max(page, 1), pageCount);
}

export async function listBatchRoster(
  academyId: string,
  batchId: string,
  input: { page: number; today: string },
): Promise<BatchRoster | null> {
  const db = getDb();
  const [batch] = await db
    .select({ name: batches.name })
    .from(batches)
    .where(and(eq(batches.id, batchId), eq(batches.academyId, academyId)))
    .limit(1);
  if (!batch) {
    return null;
  }

  const rows = await db
    .select({
      playerId: players.id,
      fullName: players.fullName,
      phone: players.phone,
      validFrom: enrollments.validFrom,
      validUntil: enrollments.validUntil,
      pausedOn: enrollmentPauses.pausedOn,
      plannedLastPausedOn: enrollmentPauses.plannedLastPausedOn,
    })
    .from(enrollments)
    .innerJoin(
      players,
      and(eq(players.id, enrollments.playerId), eq(players.academyId, academyId)),
    )
    .leftJoin(
      enrollmentPauses,
      and(
        eq(enrollmentPauses.enrollmentId, enrollments.id),
        eq(enrollmentPauses.academyId, academyId),
        isNull(enrollmentPauses.resumedOn),
      ),
    )
    .where(
      and(eq(enrollments.academyId, academyId), eq(enrollments.batchId, batchId)),
    )
    .orderBy(sql`${enrollments.validFrom} desc`, asc(enrollments.id));

  const byPlayer = new Map<string, RosterPlayer>();
  for (const row of rows) {
    if (byPlayer.has(row.playerId)) {
      continue;
    }
    const term = enrollmentTerm(
      { validUntil: row.validUntil },
      row.pausedOn
        ? {
            pausedOn: row.pausedOn,
            plannedLastPausedOn: row.plannedLastPausedOn,
          }
        : null,
      input.today,
    );
    if (term.status === "lapsed") {
      continue;
    }
    byPlayer.set(row.playerId, {
      id: row.playerId,
      fullName: row.fullName,
      phone: row.phone,
      status: term.status,
      pausedOn: term.pausedOn,
      plannedLastPausedOn: term.plannedLastPausedOn,
    });
  }

  const matched = [...byPlayer.values()].sort((left, right) => {
    const byName = left.fullName < right.fullName ? -1 : left.fullName > right.fullName ? 1 : 0;
    if (byName !== 0) {
      return byName;
    }
    return left.id < right.id ? -1 : 1;
  });
  const page = clampPage(matched.length, input.page);
  return {
    batchName: batch.name,
    page,
    total: matched.length,
    players: matched.slice(
      (page - 1) * PLAYERS_PER_PAGE,
      page * PLAYERS_PER_PAGE,
    ),
  };
}

export async function getPlayer(
  academyId: string,
  playerId: string,
  today: string,
): Promise<PlayerDetail | null> {
  const db = getDb();
  const [player] = await db
    .select({
      id: players.id,
      fullName: players.fullName,
      phone: players.phone,
      dateOfBirth: players.dateOfBirth,
      guardianFullName: players.guardianFullName,
    })
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.academyId, academyId)))
    .limit(1);
  if (!player) {
    return null;
  }

  const rows = await db
    .select({
      id: enrollments.id,
      batchId: enrollments.batchId,
      batchName: batches.name,
      daysPerWeek: enrollments.daysPerWeek,
      termDays: enrollments.termDays,
      feePaisePaid: enrollments.feePaisePaid,
      validFrom: enrollments.validFrom,
      validUntil: enrollments.validUntil,
      renewedFromEnrollmentId: enrollments.renewedFromEnrollmentId,
      pausedOn: enrollmentPauses.pausedOn,
      plannedLastPausedOn: enrollmentPauses.plannedLastPausedOn,
    })
    .from(enrollments)
    .innerJoin(
      batches,
      and(eq(batches.id, enrollments.batchId), eq(batches.academyId, academyId)),
    )
    .leftJoin(
      enrollmentPauses,
      and(
        eq(enrollmentPauses.enrollmentId, enrollments.id),
        eq(enrollmentPauses.academyId, academyId),
        isNull(enrollmentPauses.resumedOn),
      ),
    )
    .where(
      and(
        eq(enrollments.academyId, academyId),
        eq(enrollments.playerId, playerId),
      ),
    )
    .orderBy(sql`${enrollments.validFrom} desc`, asc(enrollments.id));

  return {
    ...player,
    enrollments: rows.map((row) => {
      const term = enrollmentTerm(
        { validUntil: row.validUntil },
        row.pausedOn
          ? {
              pausedOn: row.pausedOn,
              plannedLastPausedOn: row.plannedLastPausedOn,
            }
          : null,
        today,
      );
      return {
        id: row.id,
        batchId: row.batchId,
        batchName: row.batchName,
        status: term.status,
        daysPerWeek: row.daysPerWeek,
        termDays: row.termDays,
        feePaisePaid: row.feePaisePaid,
        validFrom: row.validFrom,
        effectiveValidUntil: term.effectiveValidUntil,
        pausedOn: term.pausedOn,
        plannedLastPausedOn: term.plannedLastPausedOn,
        continuesPreviousTerm: row.renewedFromEnrollmentId !== null,
      };
    }),
  };
}

async function findPlayer(
  tx: OwnerTx,
  academyId: string,
  intake: PlayerIntake,
) {
  const [row] = await tx
    .select({
      id: players.id,
      guardianFullName: players.guardianFullName,
      guardianPhone: players.guardianPhone,
    })
    .from(players)
    .where(
      and(
        eq(players.academyId, academyId),
        eq(players.fullNameNormalized, intake.fullNameNormalized),
        eq(players.phone, intake.phone),
      ),
    )
    .limit(1);
  return row;
}
