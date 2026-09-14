import { sql } from "drizzle-orm";
import { getDb } from "./client";

/** Succeeds when the database is reachable. */
export async function probeDatabase(): Promise<void> {
  await getDb().execute(sql`SELECT 1`);
}
