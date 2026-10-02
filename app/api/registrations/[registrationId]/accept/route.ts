import { NextResponse } from "next/server";
import {
  recordOwnerWriteIfImpersonating,
  resolveOwnerContext,
} from "@/lib/owner-context";
import { acceptRegistration } from "@/lib/registrations";

type RouteContext = { params: Promise<{ registrationId: string }> };

function commandStatus(error: string): number {
  if (error === "invalid-input") {
    return 400;
  }
  if (error === "not-found") {
    return 404;
  }
  return 409;
}

export async function POST(request: Request, context: RouteContext) {
  const ownerContext = await resolveOwnerContext(request.headers);
  if (!ownerContext.ok) {
    if (ownerContext.error === "unauthorized") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const status = ownerContext.error === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: ownerContext.error }, { status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-input" }, { status: 400 });
  }

  const { registrationId } = await context.params;
  const result = await acceptRegistration(
    ownerContext.academy.id,
    registrationId,
    body,
    ownerContext.subjectUserId,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: commandStatus(result.error) },
    );
  }

  await recordOwnerWriteIfImpersonating(ownerContext, "registration.accept", {
    registrationId,
  });

  return NextResponse.json({ ok: true });
}
