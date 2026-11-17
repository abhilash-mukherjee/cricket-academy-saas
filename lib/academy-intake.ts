import { and, asc, eq, inArray } from "drizzle-orm";
import { batches, batchFeeOptions } from "@/db/domain-schema";
import { getDb } from "@/db/client";

export type RegistrableFeeOption = {
  id: string;
  label: string | null;
  daysPerWeek: number;
  termDays: number;
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
  const ids = await listRegistrableBatchIds(options);
  return ids.size > 0;
}

export async function listRegistrableBatchIds(options: {
  academyId: string;
  isOnlineRegistrationAllowed: boolean;
}): Promise<Set<string>> {
  if (!options.isOnlineRegistrationAllowed) {
    return new Set();
  }

  const db = getDb();
  const rows = await db
    .selectDistinct({ batchId: batchFeeOptions.batchId })
    .from(batchFeeOptions)
    .innerJoin(batches, eq(batches.id, batchFeeOptions.batchId))
    .where(
      and(
        eq(batchFeeOptions.academyId, options.academyId),
        eq(batchFeeOptions.isOffered, true),
        eq(batches.academyId, options.academyId),
        eq(batches.isOpenForRegistration, true),
      ),
    );

  return new Set(rows.map((row) => row.batchId));
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
      termDays: batchFeeOptions.termDays,
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
      termDays: option.termDays,
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
