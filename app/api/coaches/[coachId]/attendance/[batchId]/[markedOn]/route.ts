import { NextResponse } from "next/server";
import {
  clearCoachAttendance,
  getCoachAttendance,
  markCoachAttendance,
} from "@/lib/coach-attendance";
import {
  recordOwnerWriteIfImpersonating,
  resolveOwnerContext,
} from "@/lib/owner-context";

type RouteContext = {
  params: Promise<{ coachId: string; batchId: string; markedOn: string }>;
};

function denied(
  request: Request,
  error: "unauthorized" | "forbidden" | "not-found",
) {
  if (error === "unauthorized") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const status = error === "forbidden" ? 403 : 404;
  return NextResponse.json({ error }, { status });
}

function commandStatus(error: string): number {
  return error === "not-found" ? 404 : 400;
}

export async function GET(request: Request, context: RouteContext) {
  const ownerContext = await resolveOwnerContext(request.headers);
  if (!ownerContext.ok) {
    return denied(request, ownerContext.error);
  }

  const { coachId, batchId, markedOn } = await context.params;
  const result = await getCoachAttendance(
    ownerContext.academy.id,
    coachId,
    batchId,
    markedOn,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: commandStatus(result.error) },
    );
  }

  return NextResponse.json({ isPresent: result.isPresent });
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

  const { coachId, batchId, markedOn } = await context.params;
  const result = await markCoachAttendance(
    ownerContext.academy.id,
    coachId,
    batchId,
    markedOn,
    body,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: commandStatus(result.error) },
    );
  }

  if (result.changed) {
    await recordOwnerWriteIfImpersonating(
      ownerContext,
      "coach-attendance.mark",
      { coachId, batchId, markedOn },
    );
  }

  return NextResponse.json({ ok: true, changed: result.changed });
}

export async function DELETE(request: Request, context: RouteContext) {
  const ownerContext = await resolveOwnerContext(request.headers);
  if (!ownerContext.ok) {
    return denied(request, ownerContext.error);
  }

  const { coachId, batchId, markedOn } = await context.params;
  const result = await clearCoachAttendance(
    ownerContext.academy.id,
    coachId,
    batchId,
    markedOn,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: commandStatus(result.error) },
    );
  }

  if (result.changed) {
    await recordOwnerWriteIfImpersonating(
      ownerContext,
      "coach-attendance.clear",
      { coachId, batchId, markedOn },
    );
  }

  return NextResponse.json({ ok: true, changed: result.changed });
}
