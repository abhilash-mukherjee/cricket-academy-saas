import { NextResponse } from "next/server";
import { startImpersonation } from "@/lib/impersonation";
import { requireSuperAdminSession } from "@/lib/require-super-admin";

type RouteContext = { params: Promise<{ academyId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireSuperAdminSession(request);
  if (gate.error) {
    return gate.error;
  }

  const { academyId } = await context.params;
  const result = await startImpersonation(gate.session, academyId);
  if (!result.ok) {
    const status =
      result.error === "forbidden"
        ? 403
        : result.error === "not-found"
          ? 404
          : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
