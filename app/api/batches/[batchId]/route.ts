import { NextResponse } from "next/server";
import {
  recordOwnerWriteIfImpersonating,
  resolveOwnerContext,
} from "@/lib/owner-context";
import { renameBatch, setBatchOpenForRegistration } from "@/lib/batches";
import { revalidatePublicAcademyPages } from "@/lib/public-academy-pages";

type RouteContext = { params: Promise<{ batchId: string }> };

type PatchBody = {
  name?: string;
  isOpenForRegistration?: boolean;
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

  const { batchId } = await context.params;
  const body = (await request.json()) as PatchBody;
  const hasName = body.name !== undefined;
  const hasOpenFlag = body.isOpenForRegistration !== undefined;
  const hasOpen =
    hasOpenFlag && typeof body.isOpenForRegistration === "boolean";

  if (!hasName && !hasOpen) {
    return NextResponse.json({ error: "invalid-input" }, { status: 400 });
  }

  if (hasName) {
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
  }

  if (hasOpen) {
    const result = await setBatchOpenForRegistration(
      ownerContext.academy.id,
      batchId,
      body.isOpenForRegistration as boolean,
    );

    if (!result.ok) {
      const status = result.error === "not-found" ? 404 : 409;
      return NextResponse.json({ error: result.error }, { status });
    }

    await recordOwnerWriteIfImpersonating(
      ownerContext,
      body.isOpenForRegistration ? "batch.open" : "batch.close",
      { batchId },
    );
  }

  revalidatePublicAcademyPages(ownerContext.academy.slug);

  return NextResponse.json({ ok: true });
}
