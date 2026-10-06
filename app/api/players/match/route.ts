import { NextResponse } from "next/server";
import { resolveOwnerContext } from "@/lib/owner-context";
import { findPlayerMatch } from "@/lib/players";

export async function GET(request: Request) {
  const ownerContext = await resolveOwnerContext(request.headers, {
    recordActor: false,
  });
  if (!ownerContext.ok) {
    if (ownerContext.error === "unauthorized") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const status = ownerContext.error === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: ownerContext.error }, { status });
  }

  const url = new URL(request.url);
  const fullName = url.searchParams.get("fullName") ?? "";
  const phone = url.searchParams.get("phone") ?? "";
  const match = await findPlayerMatch(ownerContext.academy.id, fullName, phone);
  return NextResponse.json({ match });
}
