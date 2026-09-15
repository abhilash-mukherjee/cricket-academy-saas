import { NextResponse } from "next/server";
import { setAcademyActive } from "@/lib/admin-academies";
import { revalidatePublicAcademyPages } from "@/lib/public-academy-pages";
import { requireSuperAdminSession } from "@/lib/require-super-admin";

type RouteContext = { params: Promise<{ academyId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireSuperAdminSession(request);
  if (gate.error) {
    return gate.error;
  }

  const { academyId } = await context.params;
  const result = await setAcademyActive(academyId, true);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  revalidatePublicAcademyPages(result.slug);
  return NextResponse.json({ ok: true, isActive: true });
}
