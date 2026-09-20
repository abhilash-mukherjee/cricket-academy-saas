import { and, asc, eq, inArray } from "drizzle-orm";
import { batches, batchFeeOptions } from "@/db/domain-schema";
import { getDb } from "@/db/client";

export type RegistrableFeeOption = {
  id: string;
  label: string | null;
  daysPerWeek: number;
  termMonths: number;
  feePaise: number;
};

export type RegistrableBatch = {
  id: string;
  name: string;
  feeOptions: RegistrableFeeOption[];
};

export async function isAcademyIntakeAvailable(options: {
  academyId: string;
  isOnlineRegistrationAllowed: boolean;
}): Promise<boolean> {
  if (!options.isOnlineRegistrationAllowed) {
    return false;
  }

  return academyHasRegistrableBatch(options.academyId);
}

export async function listRegistrableBatches(
  academyId: string,
): Promise<RegistrableBatch[]> {
  const db = getDb();
  const openBatches = await db
    .select({ id: batches.id, name: batches.name })
    .from(batches)
    .where(
      and(
        eq(batches.academyId, academyId),
        eq(batches.isOpenForRegistration, true),
      ),
    )
    .orderBy(asc(batches.createdAt));

  if (openBatches.length === 0) {
    return [];
  }

  const offered = await db
    .select({
      id: batchFeeOptions.id,
      batchId: batchFeeOptions.batchId,
      label: batchFeeOptions.label,
      daysPerWeek: batchFeeOptions.daysPerWeek,
      termMonths: batchFeeOptions.termMonths,
      feePaise: batchFeeOptions.feePaise,
    })
    .from(batchFeeOptions)
    .where(
      and(
        eq(batchFeeOptions.academyId, academyId),
        eq(batchFeeOptions.isOffered, true),
        inArray(
          batchFeeOptions.batchId,
          openBatches.map((batch) => batch.id),
        ),
      ),
    )
    .orderBy(asc(batchFeeOptions.sortOrder), asc(batchFeeOptions.createdAt));

  const optionsByBatch = new Map<string, RegistrableFeeOption[]>();
  for (const option of offered) {
    const list = optionsByBatch.get(option.batchId) ?? [];
    list.push({
      id: option.id,
      label: option.label,
      daysPerWeek: option.daysPerWeek,
      termMonths: option.termMonths,
      feePaise: option.feePaise,
    });
    optionsByBatch.set(option.batchId, list);
  }

  return openBatches.flatMap((batch) => {
    const feeOptions = optionsByBatch.get(batch.id);
    if (!feeOptions || feeOptions.length === 0) {
      return [];
    }
    return [{ id: batch.id, name: batch.name, feeOptions }];
  });
}

async function academyHasRegistrableBatch(academyId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: batchFeeOptions.id })
    .from(batchFeeOptions)
    .innerJoin(batches, eq(batches.id, batchFeeOptions.batchId))
    .where(
      and(
        eq(batchFeeOptions.academyId, academyId),
        eq(batchFeeOptions.isOffered, true),
        eq(batches.academyId, academyId),
        eq(batches.isOpenForRegistration, true),
      ),
    )
    .limit(1);

  return Boolean(row);
}
