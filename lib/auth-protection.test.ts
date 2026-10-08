import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  isAppRoute,
  shouldRedirectAppRouteToLogin,
  shouldRedirectHomepageToApp,
} from "./auth-protection";

const sessionCookie = "better-auth.session_token=session";

describe("auth protection", () => {
  it("treats /app and nested staff routes as protected", () => {
    expect(isAppRoute("/app")).toBe(true);
    expect(isAppRoute("/app/registrations")).toBe(true);
    expect(isAppRoute("/login")).toBe(false);
  });

  it("redirects unauthenticated /app requests to login", () => {
    const request = new NextRequest("http://localhost:3000/app");
    expect(shouldRedirectAppRouteToLogin(request)).toBe(true);
  });

  it("does not redirect public routes", () => {
    const request = new NextRequest("http://localhost:3000/login");
    expect(shouldRedirectAppRouteToLogin(request)).toBe(false);
  });

  it("sends signed-in homepage visitors to /app", () => {
    const request = new NextRequest("http://localhost:3000/", {
      headers: { cookie: sessionCookie },
    });
    expect(shouldRedirectHomepageToApp(request)).toBe(true);
  });

  it("keeps the homepage public without a session cookie", () => {
    const request = new NextRequest("http://localhost:3000/");
    expect(shouldRedirectHomepageToApp(request)).toBe(false);
  });

  it("does not send signed-in visitors away from other public routes", () => {
    const headers = { cookie: sessionCookie };
    expect(
      shouldRedirectHomepageToApp(
        new NextRequest("http://localhost:3000/login", { headers }),
      ),
    ).toBe(false);
    expect(
      shouldRedirectHomepageToApp(
        new NextRequest("http://localhost:3000/a/blitz", { headers }),
      ),
    ).toBe(false);
  });
});
