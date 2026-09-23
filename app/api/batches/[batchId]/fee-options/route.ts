import { NextResponse } from "next/server";
import {
  recordOwnerWriteIfImpersonating,
  resolveOwnerContext,
} from "@/lib/owner-context";
import { createFeeOption } from "@/lib/batch-fee-options";
import { revalidatePublicAcademyPages } from "@/lib/public-academy-pages";

type RouteContext = { params: Promise<{ batchId: string }> };

type CreateBody = {
  daysPerWeek?: number;
  termDays?: number;
  feeInr?: number;
  label?: string | null;
};

export async function POST(request: Request, context: RouteContext) {
  const ownerContext = await resolveOwnerContext(request.headers);
  if (!ownerContext.ok) {
    if (ownerContext.error === "unauthorized") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const status = ownerContext.error === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: ownerContext.error }, { status });
  }

  const { batchId } = await context.params;
  const body = (await request.json()) as CreateBody;
  const result = await createFeeOption(ownerContext.academy.id, batchId, {
    daysPerWeek: Number(body.daysPerWeek),
    termDays: Number(body.termDays),
    feeInr: Number(body.feeInr),
    label: body.label,
  });

  if (!result.ok) {
    const status =
      result.error === "identity-taken"
        ? 409
        : result.error === "not-found"
          ? 404
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  await recordOwnerWriteIfImpersonating(ownerContext, "fee-option.create", {
    batchId,
    feeOptionId: result.id,
  });
  revalidatePublicAcademyPages(ownerContext.academy.slug);

  return NextResponse.json({ ok: true, id: result.id });
}
