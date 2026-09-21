import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GET, POST } from "./[...all]/route";
import { proxy } from "@/proxy";
import {
  clearCapturedMail,
  enableMailCapture,
  disableMailCapture,
  extractFirstUrl,
  getCapturedMail,
} from "@/lib/mailer";
import { user } from "@/db/auth-schema";
import { getDb } from "@/db/client";

const sessionCookie = vi.hoisted(() => ({ value: "" }));

vi.mock("next/headers", () => ({
  headers: async () => {
    const headers = new Headers();
    if (sessionCookie.value) {
      headers.set("cookie", sessionCookie.value);
    }
    return headers;
  },
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    connection: async () => undefined,
  };
});

const hasDatabase = Boolean(process.env.DATABASE_URL);
const hasAuthSecret = Boolean(process.env.BETTER_AUTH_SECRET);

describe.skipIf(!hasDatabase || !hasAuthSecret)(
  "staff magic-link auth at the App Router seam",
  () => {
    const testEmail = `staff-${Date.now()}@example.com`;

    beforeEach(() => {
      enableMailCapture();
      sessionCookie.value = "";
    });

    afterEach(async () => {
      disableMailCapture();
      clearCapturedMail();
      sessionCookie.value = "";

      const db = getDb();
      await db.delete(user).where(eq(user.email, testEmail));
    });

    it("requests a link, captures mail, follows it, and authenticates /app", async () => {
      const origin = "http://localhost:3000";

      const signInResponse = await POST(
        new Request(`${origin}/api/auth/sign-in/magic-link`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
          },
          body: JSON.stringify({
            email: testEmail,
            name: "Test Owner",
            callbackURL: "/app",
          }),
        }),
      );

      expect(signInResponse.status).toBe(200);

      const captured = getCapturedMail();
      expect(captured).toHaveLength(1);
      expect(captured[0]?.to).toBe(testEmail);

      const verifyUrl = extractFirstUrl(captured[0]?.html ?? "");
      expect(verifyUrl).toBeTruthy();

      const verifyRequest = new Request(verifyUrl!, {
        method: "GET",
        headers: { origin },
        redirect: "manual",
      });
      const verifyResponse = await GET(verifyRequest);
      expect(verifyResponse.status).toBeGreaterThanOrEqual(300);
      expect(verifyResponse.status).toBeLessThan(400);

      const setCookie = verifyResponse.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();

      const sessionResponse = await GET(
        new Request(`${origin}/api/auth/get-session`, {
          headers: {
            cookie: setCookie!,
            origin,
          },
        }),
      );

      expect(sessionResponse.status).toBe(200);
      const sessionBody = await sessionResponse.json();
      expect(sessionBody.user.email).toBe(testEmail);

      const unauthenticatedApp = proxy(new NextRequest(`${origin}/app`));
      expect(unauthenticatedApp.status).toBeGreaterThanOrEqual(300);
      expect(unauthenticatedApp.status).toBeLessThan(400);
      expect(unauthenticatedApp.headers.get("location")).toContain("/login");

      const authenticatedApp = proxy(
        new NextRequest(`${origin}/app`, {
          headers: { cookie: setCookie! },
        }),
      );
      expect(authenticatedApp.headers.get("location")).toBeNull();

      const unauthenticatedHome = proxy(new NextRequest(`${origin}/`));
      expect(unauthenticatedHome.headers.get("location")).toBeNull();

      const authenticatedHome = proxy(
        new NextRequest(`${origin}/`, {
          headers: { cookie: setCookie! },
        }),
      );
      expect(authenticatedHome.status).toBeGreaterThanOrEqual(300);
      expect(authenticatedHome.status).toBeLessThan(400);
      expect(authenticatedHome.headers.get("location")).toBe(`${origin}/app`);

      sessionCookie.value = setCookie!;
      const { default: AppLayout } = await import("@/app/app/layout");
      const html = renderToStaticMarkup(
        await AppLayout({
          children: createElement("p", null, "signed in"),
          params: Promise.resolve({}),
        }),
      );
      expect(html).toContain(testEmail);
      expect(html).toContain("signed in");
    });
  },
);
