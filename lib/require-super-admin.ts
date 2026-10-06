import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logActor } from "@/lib/request-trace";

export async function requireSuperAdminSession(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return {
      error: NextResponse.redirect(new URL("/login", request.url)),
    } as const;
  }

  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    logActor(session.user.id);
  }

  if (!session.user.isSuperAdmin) {
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    } as const;
  }

  return { session } as const;
}
