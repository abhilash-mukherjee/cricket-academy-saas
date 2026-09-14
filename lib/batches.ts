import { eq, asc } from "drizzle-orm";
import { batches } from "@/db/domain-schema";
import { getDb } from "@/db/client";

export async function listBatches(academyId: string) {
  const db = getDb();
  return db
    .select({
      id: batches.id,
      name: batches.name,
      isOpenForRegistration: batches.isOpenForRegistration,
    })
    .from(batches)
    .where(eq(batches.academyId, academyId))
    .orderBy(asc(batches.createdAt));
}
