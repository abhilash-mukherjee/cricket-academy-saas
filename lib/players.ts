import { and, eq } from "drizzle-orm";
import { players } from "@/db/domain-schema";
import type { getTransactionalDb } from "@/db/client";
import { postgresConstraint } from "@/lib/postgres-constraint";

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
