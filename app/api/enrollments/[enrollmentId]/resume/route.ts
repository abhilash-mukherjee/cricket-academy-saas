import { NextResponse } from "next/server";
import {
  recordOwnerWriteIfImpersonating,
  resolveOwnerContext,
} from "@/lib/owner-context";
import { resumeEnrollment } from "@/lib/enrollments";

type RouteContext = { params: Promise<{ enrollmentId: string }> };

function commandStatus(error: string): number {
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

  const { enrollmentId } = await context.params;
  const result = await resumeEnrollment(
    ownerContext.academy.id,
    enrollmentId,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: commandStatus(result.error) },
    );
  }

  await recordOwnerWriteIfImpersonating(ownerContext, "enrollment.resume", {
    enrollmentId,
  });

  return NextResponse.json(result);
}
