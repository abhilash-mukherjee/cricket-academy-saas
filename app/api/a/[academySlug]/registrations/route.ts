import { NextResponse } from "next/server";
import {
  createRegistration,
  findActiveAcademyIdBySlug,
} from "@/lib/registrations";

type RouteContext = { params: Promise<{ academySlug: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { academySlug } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-input" }, { status: 400 });
  }

  const academyId = await findActiveAcademyIdBySlug(academySlug);
  if (!academyId) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const result = await createRegistration(academyId, body);
  if (!result.ok) {
    const status = result.error === "invalid-input" ? 400 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, snapshot: result.snapshot });
}
