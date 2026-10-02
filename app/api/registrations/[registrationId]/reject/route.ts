import { NextResponse } from "next/server";
import {
  recordOwnerWriteIfImpersonating,
  resolveOwnerContext,
} from "@/lib/owner-context";
import { rejectRegistration } from "@/lib/registrations";

type RouteContext = { params: Promise<{ registrationId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const ownerContext = await resolveOwnerContext(request.headers);
  if (!ownerContext.ok) {
    if (ownerContext.error === "unauthorized") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const status = ownerContext.error === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: ownerContext.error }, { status });
  }

  const { registrationId } = await context.params;
  const result = await rejectRegistration(
    ownerContext.academy.id,
    registrationId,
    ownerContext.subjectUserId,
  );

  if (!result.ok) {
    const status = result.error === "not-found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  await recordOwnerWriteIfImpersonating(ownerContext, "registration.reject", {
    registrationId,
  });

  return NextResponse.json({ ok: true });
}
