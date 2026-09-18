import { NextResponse } from "next/server";
import {
  recordOwnerWriteIfImpersonating,
  resolveOwnerContext,
} from "@/lib/owner-context";
import { renameBatch } from "@/lib/batches";
import { revalidatePublicAcademyPages } from "@/lib/public-academy-pages";

type RouteContext = { params: Promise<{ batchId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const ownerContext = await resolveOwnerContext(request.headers);
  if (!ownerContext.ok) {
    if (ownerContext.error === "unauthorized") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const status = ownerContext.error === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: ownerContext.error }, { status });
  }

  const { batchId } = await context.params;
  const body = (await request.json()) as { name?: string };
  const result = await renameBatch(
    ownerContext.academy.id,
    batchId,
    String(body.name ?? ""),
  );

  if (!result.ok) {
    const status =
      result.error === "name-taken"
        ? 409
        : result.error === "not-found"
          ? 404
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  await recordOwnerWriteIfImpersonating(ownerContext, "batch.rename", {
    batchId,
  });
  revalidatePublicAcademyPages(ownerContext.academy.slug);

  return NextResponse.json({ ok: true });
}
