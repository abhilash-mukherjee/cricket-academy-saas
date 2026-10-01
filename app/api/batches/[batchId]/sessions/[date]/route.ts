import { NextResponse } from "next/server";
import {
  discardSession,
  saveSessionAttendance,
} from "@/lib/batch-sessions";
import {
  recordOwnerWriteIfImpersonating,
  resolveOwnerContext,
} from "@/lib/owner-context";

type RouteContext = {
  params: Promise<{ batchId: string; date: string }>;
};

function commandStatus(error: string): number {
  if (error === "invalid-input" || error === "session-date") {
    return 400;
  }
  if (error === "not-found") {
    return 404;
  }
  return 409;
}

function denied(request: Request, error: "unauthorized" | "forbidden" | "not-found") {
  if (error === "unauthorized") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const status = error === "forbidden" ? 403 : 404;
  return NextResponse.json({ error }, { status });
}

export async function PUT(request: Request, context: RouteContext) {
  const ownerContext = await resolveOwnerContext(request.headers);
  if (!ownerContext.ok) {
    return denied(request, ownerContext.error);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-input" }, { status: 400 });
  }

  const { batchId, date } = await context.params;
  const result = await saveSessionAttendance(
    ownerContext.academy.id,
    batchId,
    date,
    body,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: commandStatus(result.error) },
    );
  }

  await recordOwnerWriteIfImpersonating(ownerContext, "batch-session.save", {
    batchId,
    sessionDate: date,
  });
  return NextResponse.json(result);
}

export async function DELETE(request: Request, context: RouteContext) {
  const ownerContext = await resolveOwnerContext(request.headers);
  if (!ownerContext.ok) {
    return denied(request, ownerContext.error);
  }

  const { batchId, date } = await context.params;
  const result = await discardSession(
    ownerContext.academy.id,
    batchId,
    date,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: commandStatus(result.error) },
    );
  }

  await recordOwnerWriteIfImpersonating(ownerContext, "batch-session.discard", {
    batchId,
    sessionDate: date,
  });
  return NextResponse.json(result);
}
