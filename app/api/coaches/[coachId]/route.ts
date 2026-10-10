import { NextResponse } from "next/server";
import {
  recordOwnerWriteIfImpersonating,
  resolveOwnerContext,
} from "@/lib/owner-context";
import { removeCoach, renameCoach } from "@/lib/coaches";

type RouteContext = { params: Promise<{ coachId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const ownerContext = await resolveOwnerContext(request.headers);
  if (!ownerContext.ok) {
    if (ownerContext.error === "unauthorized") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const status = ownerContext.error === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: ownerContext.error }, { status });
  }

  const { coachId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-input" }, { status: 400 });
  }

  const name =
    typeof body === "object" && body !== null && "name" in body
      ? (body as { name: unknown }).name
      : undefined;

  const result = await renameCoach(ownerContext.academy.id, coachId, name);

  if (!result.ok) {
    const status =
      result.error === "name-taken"
        ? 409
        : result.error === "not-found"
          ? 404
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  await recordOwnerWriteIfImpersonating(ownerContext, "coach.rename", {
    coachId,
  });

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

  const { coachId } = await context.params;
  const result = await removeCoach(ownerContext.academy.id, coachId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  await recordOwnerWriteIfImpersonating(ownerContext, "coach.remove", {
    coachId,
  });

  return NextResponse.json({ ok: true });
}
