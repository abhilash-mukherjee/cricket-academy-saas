import { NextRequest, NextResponse } from "next/server";
import {
  shouldRedirectAppRouteToLogin,
  shouldRedirectHomepageToApp,
} from "@/lib/auth-protection";

export function proxy(request: NextRequest) {
  if (shouldRedirectAppRouteToLogin(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (shouldRedirectHomepageToApp(request)) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/app/:path*"],
};
