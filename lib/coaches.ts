import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { coaches } from "@/db/domain-schema";
import { getDb } from "@/db/client";
import { postgresConstraint } from "@/lib/postgres-constraint";
import { logInfo, logWarning } from "@/lib/request-trace";

export type CoachRecord = {
  id: string;
  name: string;
};

export type CoachWriteError = "invalid-input" | "name-taken" | "not-found";

export type AddCoachResult =
  | { ok: true; id: string }
  | { ok: false; error: Exclude<CoachWriteError, "not-found"> };

export type RenameCoachResult =
  | { ok: true }
  | { ok: false; error: CoachWriteError };

export type RemoveCoachResult =
  | { ok: true }
  | { ok: false; error: "not-found" };

const coachNameSchema = z.string().trim().min(1).max(200);

function parseCoachName(
  name: unknown,
): { ok: true; name: string } | { ok: false; error: "invalid-input" } {
  const parsed = coachNameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: "invalid-input" };
  }
  return { ok: true, name: parsed.data };
}

export async function listCoaches(academyId: string): Promise<CoachRecord[]> {
  const db = getDb();
  return db
    .select({
      id: coaches.id,
      name: coaches.name,
    })
    .from(coaches)
    .where(eq(coaches.academyId, academyId))
    .orderBy(sql`lower(${coaches.name})`, asc(coaches.name), asc(coaches.id));
}

export async function getCoach(
  academyId: string,
  coachId: string,
): Promise<CoachRecord | null> {
  const db = getDb();
  const [coach] = await db
    .select({
      id: coaches.id,
      name: coaches.name,
    })
    .from(coaches)
    .where(and(eq(coaches.id, coachId), eq(coaches.academyId, academyId)))
    .limit(1);
  return coach ?? null;
}

export async function addCoach(
  academyId: string,
  name: unknown,
): Promise<AddCoachResult> {
  const parsed = parseCoachName(name);
  if (!parsed.ok) {
    logWarning("Coach was not created.", "invalid-input");
    return parsed;
  }

  const db = getDb();
  try {
    const [created] = await db
      .insert(coaches)
      .values({
        academyId,
        name: parsed.name,
      })
      .returning({ id: coaches.id });

    logInfo(`Coach created successfully with ID: ${created.id}.`, {
      name: parsed.name,
    });
    return { ok: true, id: created.id };
  } catch (error) {
    if (postgresConstraint(error) === "coaches_academy_id_name_unique") {
      logWarning("Coach was not created.", "name-taken", {
        name: parsed.name,
      });
      return { ok: false, error: "name-taken" };
    }
    throw error;
  }
}

export async function renameCoach(
  academyId: string,
  coachId: string,
  name: unknown,
): Promise<RenameCoachResult> {
  const parsed = parseCoachName(name);
  if (!parsed.ok) {
    logWarning(`Coach was not renamed with ID: ${coachId}.`, "invalid-input");
    return parsed;
  }

  const db = getDb();
  try {
    const updated = await db
      .update(coaches)
      .set({ name: parsed.name })
      .where(and(eq(coaches.id, coachId), eq(coaches.academyId, academyId)))
      .returning({ id: coaches.id });

    if (updated.length === 0) {
      logWarning(`Coach was not renamed with ID: ${coachId}.`, "not-found", {
        name: parsed.name,
      });
      return { ok: false, error: "not-found" };
    }

    logInfo(`Coach renamed successfully with ID: ${coachId}.`, {
      name: parsed.name,
    });
    return { ok: true };
  } catch (error) {
    if (postgresConstraint(error) === "coaches_academy_id_name_unique") {
      logWarning(`Coach was not renamed with ID: ${coachId}.`, "name-taken", {
        name: parsed.name,
      });
      return { ok: false, error: "name-taken" };
    }
    throw error;
  }
}

export async function removeCoach(
  academyId: string,
  coachId: string,
): Promise<RemoveCoachResult> {
  const db = getDb();
  const deleted = await db
    .delete(coaches)
    .where(and(eq(coaches.id, coachId), eq(coaches.academyId, academyId)))
    .returning({ id: coaches.id });

  if (deleted.length === 0) {
    logWarning(`Coach was not removed with ID: ${coachId}.`, "not-found");
    return { ok: false, error: "not-found" };
  }

  logInfo(`Coach removed successfully with ID: ${coachId}.`);
  return { ok: true };
}
