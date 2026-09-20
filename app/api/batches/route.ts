import { NextResponse } from "next/server";
import {
  recordOwnerWriteIfImpersonating,
  resolveOwnerContext,
} from "@/lib/owner-context";
import { createBatch } from "@/lib/batches";
import { revalidatePublicAcademyPages } from "@/lib/public-academy-pages";

export async function POST(request: Request) {
  const context = await resolveOwnerContext(request.headers);
  if (!context.ok) {
    if (context.error === "unauthorized") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const status = context.error === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: context.error }, { status });
  }

  const body = (await request.json()) as { name?: string };
  const result = await createBatch(context.academy.id, String(body.name ?? ""));

  if (!result.ok) {
    const status = result.error === "name-taken" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  await recordOwnerWriteIfImpersonating(context, "batch.create", {
    batchId: result.id,
  });
  revalidatePublicAcademyPages(context.academy.slug);

  return NextResponse.json({ ok: true, id: result.id });
}
