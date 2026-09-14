import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GET, POST } from "./[...all]/route";
import { proxy } from "@/proxy";
import { MarketingShell } from "@/app/marketing-shell";
import { BrochureView } from "@/app/a/[academySlug]/brochure-view";
import {
  clearCapturedMail,
  disableMailCapture,
  enableMailCapture,
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
const origin = "http://localhost:3000";

async function signInStaff(email: string): Promise<string> {
  const signInResponse = await POST(
    new Request(`${origin}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
      },
      body: JSON.stringify({
        email,
        name: "Test Owner",
        callbackURL: "/app",
      }),
    }),
  );
  expect(signInResponse.status).toBe(200);

  const verifyUrl = extractFirstUrl(getCapturedMail()[0]?.html ?? "");
  expect(verifyUrl).toBeTruthy();

  const verifyResponse = await GET(
    new Request(verifyUrl!, {
      method: "GET",
      headers: { origin },
      redirect: "manual",
    }),
  );
  const setCookie = verifyResponse.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!;
}

describe("public chrome has no Sign out", () => {
  it("keeps Sign out off the product homepage and Academy brochure", () => {
    const homepage = renderToStaticMarkup(
      createElement(MarketingShell, null, createElement("p", null, "hello")),
    );
    expect(homepage).not.toContain("Sign out");

    const brochure = renderToStaticMarkup(
      createElement(BrochureView, {
        brochure: {
          name: "Blitz Cricket",
          slug: "blitz-cricket",
          tagline: "Play",
          location: "Bengaluru",
          phone: "9999999999",
        },
      }),
    );
    expect(brochure).not.toContain("Sign out");
  });
});

describe.skipIf(!hasDatabase || !hasAuthSecret)(
  "staff Sign out at the App Router seam",
  () => {
    const testEmail = `sign-out-${Date.now()}@example.com`;

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

    it("ends this browser session from /app chrome and gates /app again", async () => {
      const setCookie = await signInStaff(testEmail);
      sessionCookie.value = setCookie;

      const { default: AppLayout } = await import("@/app/app/layout");
      const html = renderToStaticMarkup(
        await AppLayout({
          children: createElement("p", null, "signed in"),
          params: Promise.resolve({}),
        }),
      );
      expect(html).toContain(testEmail);
      expect(html).toContain("Sign out");
      expect(html).toContain("signed in");

      const signOutResponse = await POST(
        new Request(`${origin}/api/auth/sign-out`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: setCookie,
            origin,
          },
          body: JSON.stringify({}),
        }),
      );
      expect(signOutResponse.status).toBe(200);

      const clearedCookie = signOutResponse.headers.get("set-cookie");
      expect(clearedCookie).toBeTruthy();
      expect(clearedCookie!.toLowerCase()).toContain("max-age=0");

      const sessionResponse = await GET(
        new Request(`${origin}/api/auth/get-session`, {
          headers: {
            cookie: setCookie,
            origin,
          },
        }),
      );
      expect(sessionResponse.status).toBe(200);
      expect(await sessionResponse.json()).toBeNull();

      const afterSignOut = proxy(
        new NextRequest(`${origin}/app`, {
          headers: { cookie: clearedCookie!.split(";")[0] ?? "" },
        }),
      );
      expect(afterSignOut.status).toBeGreaterThanOrEqual(300);
      expect(afterSignOut.status).toBeLessThan(400);
      expect(afterSignOut.headers.get("location")).toContain("/login");
    });
  },
);
