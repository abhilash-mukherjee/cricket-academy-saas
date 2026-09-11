import { getDb } from "./client";
import { schemaBootstrap } from "./schema";

/** Succeeds when the marker table exists; throws if migrate has not been applied. */
export async function probeBootstrapMarker(): Promise<void> {
  await getDb()
    .select({ id: schemaBootstrap.id })
    .from(schemaBootstrap)
    .limit(1);
}
