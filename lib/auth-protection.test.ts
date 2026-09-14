import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  isAppRoute,
  shouldRedirectAppRouteToLogin,
} from "./auth-protection";

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
});
