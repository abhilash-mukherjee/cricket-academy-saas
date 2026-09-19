import { NextResponse } from "next/server";
import {
  recordOwnerWriteIfImpersonating,
  resolveOwnerContext,
} from "@/lib/owner-context";
import { updateFeeOption, deleteFeeOption } from "@/lib/batch-fee-options";
import { revalidatePublicAcademyPages } from "@/lib/public-academy-pages";

type RouteContext = {
  params: Promise<{ batchId: string; feeOptionId: string }>;
};

type UpdateBody = {
  feeInr?: number;
  label?: string | null;
  sortOrder?: number;
  isOffered?: boolean;
};

export async function PATCH(request: Request, context: RouteContext) {
  const ownerContext = await resolveOwnerContext(request.headers);
  if (!ownerContext.ok) {
    if (ownerContext.error === "unauthorized") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const status = ownerContext.error === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: ownerContext.error }, { status });
  }

  const { batchId, feeOptionId } = await context.params;
  const body = (await request.json()) as UpdateBody;
  const result = await updateFeeOption(
    ownerContext.academy.id,
    batchId,
    feeOptionId,
    {
      feeInr: body.feeInr === undefined ? undefined : Number(body.feeInr),
      label: body.label,
      sortOrder:
        body.sortOrder === undefined ? undefined : Number(body.sortOrder),
      isOffered: body.isOffered,
    },
  );

  if (!result.ok) {
    const status = result.error === "not-found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  await recordOwnerWriteIfImpersonating(ownerContext, "fee-option.update", {
    batchId,
    feeOptionId,
  });
  revalidatePublicAcademyPages(ownerContext.academy.slug);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const ownerContext = await resolveOwnerContext(request.headers);
  if (!ownerContext.ok) {
    if (ownerContext.error === "unauthorized") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const status = ownerContext.error === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: ownerContext.error }, { status });
  }

  const { batchId, feeOptionId } = await context.params;
  const result = await deleteFeeOption(
    ownerContext.academy.id,
    batchId,
    feeOptionId,
  );

  if (!result.ok) {
    const status = result.error === "in-use" ? 409 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }

  await recordOwnerWriteIfImpersonating(ownerContext, "fee-option.delete", {
    batchId,
    feeOptionId,
  });
  revalidatePublicAcademyPages(ownerContext.academy.slug);

  return NextResponse.json({ ok: true });
}
