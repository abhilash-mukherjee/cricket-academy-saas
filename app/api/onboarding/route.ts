import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { completeOwnerOnboarding } from "@/lib/owner-onboarding";

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session.user.isSuperAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as Record<string, string | null | undefined>;
  const result = await completeOwnerOnboarding(session.user.id, {
    displayName: String(body.displayName ?? ""),
    academyName: String(body.academyName ?? ""),
    slug: String(body.slug ?? ""),
    batchName: String(body.batchName ?? ""),
    tagline: String(body.tagline ?? ""),
    location: String(body.location ?? ""),
    phone: String(body.phone ?? ""),
  });

  if (!result.ok) {
    const status = result.error === "already-owns-academy" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
