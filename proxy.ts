import { NextRequest, NextResponse } from "next/server";
import { shouldRedirectAppRouteToLogin } from "@/lib/auth-protection";

export function proxy(request: NextRequest) {
  if (shouldRedirectAppRouteToLogin(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
