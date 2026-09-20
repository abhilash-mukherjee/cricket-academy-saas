import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as verifyAuth, POST as authPost } from "@/app/api/auth/[...all]/route";
import { POST as completeOnboarding } from "@/app/api/onboarding/route";
import {
  clearCapturedMail,
  disableMailCapture,
  enableMailCapture,
  extractFirstUrl,
  getCapturedMail,
} from "@/lib/mailer";
import { academies, batches } from "@/db/domain-schema";
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
  cookies: async () => ({
    get: () => undefined,
  }),
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

function headerBar(html: string): string {
  const header = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
  return header.replace(/<nav aria-label="Account menu"[\s\S]*?<\/nav>/, "");
}

function accountMenu(html: string): string {
  return html.match(/<nav aria-label="Account menu"[\s\S]*?<\/nav>/)?.[0] ?? "";
}

async function signIn(email: string, name: string): Promise<string> {
  const signInResponse = await authPost(
    new Request(`${origin}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
      },
      body: JSON.stringify({
        email,
        name,
        callbackURL: "/app",
      }),
    }),
  );
  expect(signInResponse.status).toBe(200);

  const verifyUrl = extractFirstUrl(getCapturedMail().at(-1)?.html ?? "");
  expect(verifyUrl).toBeTruthy();

  const verifyResponse = await verifyAuth(
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

async function onboardOwner(cookie: string, slug: string) {
  const response = await completeOnboarding(
    new Request(`${origin}/api/onboarding`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie,
      },
      body: JSON.stringify({
        displayName: "Asha Rao",
        academyName: "Blitz Cricket Academy",
        slug,
        batchName: "U-14 evening",
      }),
    }),
  );
  expect(response.status).toBe(200);
}

async function deleteOwnerByEmail(email: string) {
  const db = getDb();
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (owner) {
    const owned = await db
      .select({ id: academies.id })
      .from(academies)
      .where(eq(academies.ownerUserId, owner.id));
    for (const academy of owned) {
      await db.delete(batches).where(eq(batches.academyId, academy.id));
      await db.delete(academies).where(eq(academies.id, academy.id));
    }
  }
  await db.delete(user).where(eq(user.email, email));
}

describe.skipIf(!hasDatabase || !hasAuthSecret)(
  "staff /app chrome at the App Router seam",
  () => {
    const stamp = Date.now();
    const ownerEmail = `chrome-owner-${stamp}@example.com`;
    const superAdminEmail = `chrome-super-${stamp}@example.com`;
    const slug = `chrome-${stamp}`;

    beforeEach(() => {
      enableMailCapture();
      sessionCookie.value = "";
    });

    afterEach(async () => {
      disableMailCapture();
      clearCapturedMail();
      sessionCookie.value = "";
      await deleteOwnerByEmail(ownerEmail);
      await deleteOwnerByEmail(superAdminEmail);
    });

    it("keeps email and Sign out out of the Owner dashboard header bar, with Owner links in the menu", async () => {
      const cookie = await signIn(ownerEmail, "Asha Rao");
      await onboardOwner(cookie, slug);
      sessionCookie.value = cookie;

      const { default: AppLayout } = await import("./layout");
      const { default: DashboardPage } = await import("./dashboard/page");
      const html = renderToStaticMarkup(
        await AppLayout({
          children: await DashboardPage(),
          params: Promise.resolve({}),
        }),
      );

      const bar = headerBar(html);
      expect(bar).toContain('aria-label="Open menu"');
      expect(bar).not.toContain(ownerEmail);
      expect(bar).not.toContain("Sign out");

      const menu = accountMenu(html);
      expect(menu).toContain("Asha Rao");
      expect(menu).toContain(ownerEmail);
      expect(menu).toContain("Edit brochure");
      expect(menu).toContain('href="/app/brochure"');
      expect(menu).toContain("Batches");
      expect(menu).toContain('href="/app/batches"');
      expect(menu).toContain("Conversion page");
      expect(menu).toContain('href="/app/conversion"');
      expect(menu).toContain("Sign out");
    });

    it("keeps Owner links out of the Super-admin Academies menu", async () => {
      const cookie = await signIn(superAdminEmail, "Super Admin");
      const db = getDb();
      await db
        .update(user)
        .set({ isSuperAdmin: true, emailVerified: true })
        .where(eq(user.email, superAdminEmail));
      sessionCookie.value = cookie;

      const { default: AppLayout } = await import("./layout");
      const html = renderToStaticMarkup(
        await AppLayout({
          children: createElement("p", null, "academies"),
          params: Promise.resolve({}),
        }),
      );

      const menu = accountMenu(html);
      expect(menu).toContain("Super Admin");
      expect(menu).toContain(superAdminEmail);
      expect(menu).toContain("Sign out");
      expect(menu).not.toContain("Edit brochure");
      expect(menu).not.toContain('href="/app/brochure"');
      expect(menu).not.toContain('href="/app/batches"');
      expect(menu).not.toContain("Conversion page");
      expect(menu).not.toContain('href="/app/conversion"');
    });

    it("links Batches back to Dashboard, and does not put that control on Dashboard", async () => {
      const cookie = await signIn(ownerEmail, "Asha Rao");
      await onboardOwner(cookie, slug);
      sessionCookie.value = cookie;

      const { default: BatchesPage } = await import("./batches/page");
      const { default: DashboardPage } = await import("./dashboard/page");
      const batchesHtml = renderToStaticMarkup(await BatchesPage());
      const dashboardHtml = renderToStaticMarkup(await DashboardPage());

      expect(batchesHtml).toMatch(/href="\/app\/dashboard"/);
      expect(batchesHtml).toContain("Dashboard");
      expect(dashboardHtml).not.toMatch(/href="\/app\/dashboard"/);
    });
  },
);
