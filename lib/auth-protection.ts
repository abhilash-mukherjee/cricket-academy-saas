import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function isAppRoute(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

export function shouldRedirectAppRouteToLogin(request: NextRequest): boolean {
  if (!isAppRoute(request.nextUrl.pathname)) {
    return false;
  }

  return !getSessionCookie(request);
}

export function shouldRedirectHomepageToApp(request: NextRequest): boolean {
  if (request.nextUrl.pathname !== "/") {
    return false;
  }

  return Boolean(getSessionCookie(request));
}
