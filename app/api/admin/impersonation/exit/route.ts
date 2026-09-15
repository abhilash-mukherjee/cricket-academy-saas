import { NextResponse } from "next/server";
import { endImpersonation } from "@/lib/impersonation";
import { requireSuperAdminSession } from "@/lib/require-super-admin";

export async function POST(request: Request) {
  const gate = await requireSuperAdminSession(request);
  if (gate.error) {
    return gate.error;
  }

  await endImpersonation();
  return NextResponse.json({ redirectTo: "/app/admin/academies" });
}
