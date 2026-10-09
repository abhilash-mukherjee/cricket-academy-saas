import { NextResponse } from "next/server";
import { getCoachAttendanceMonth } from "@/lib/coach-attendance";
import { resolveOwnerContext } from "@/lib/owner-context";

type RouteContext = { params: Promise<{ coachId: string }> };

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

export async function GET(request: Request, context: RouteContext) {
  const ownerContext = await resolveOwnerContext(request.headers);
  if (!ownerContext.ok) {
    return denied(request, ownerContext.error);
  }

  const { coachId } = await context.params;
  const url = new URL(request.url);
  const batchId = url.searchParams.get("batchId") ?? "";
  const month = url.searchParams.get("month") ?? "";
  const result = await getCoachAttendanceMonth(
    ownerContext.academy.id,
    coachId,
    batchId,
    month,
  );
  if (!result.ok) {
    const status = result.error === "not-found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    presentDates: result.presentDates,
    absentDates: result.absentDates,
    presentCount: result.presentCount,
    absentCount: result.absentCount,
  });
}
