import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as verifyAuth, POST as authPost } from "@/app/api/auth/[...all]/route";
import AcademyBrochurePage from "@/app/a/[academySlug]/page";
import {
  clearCapturedMail,
  disableMailCapture,
  enableMailCapture,
  extractFirstUrl,
  getCapturedMail,
} from "@/lib/mailer";
import {
  academies,
  batches,
  impersonationAuditEvents,
} from "@/db/domain-schema";
import { user } from "@/db/auth-schema";
import { getDb } from "@/db/client";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { publicAcademyCacheTag } from "@/lib/public-academy-pages";

const sessionCookie = vi.hoisted(() => ({ value: "" }));
const cookieJar = vi.hoisted(() => new Map<string, string>());
const revalidatePath = vi.hoisted(() => vi.fn());
const revalidateTag = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: async () => {
    const headers = new Headers();
    if (sessionCookie.value) {
      headers.set("cookie", sessionCookie.value);
    }
    for (const [name, value] of cookieJar) {
      const existing = headers.get("cookie");
      headers.set(
        "cookie",
        existing ? `${existing}; ${name}=${value}` : `${name}=${value}`,
      );
    }
    return headers;
  },
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: () => Promise<unknown>) =>
    () =>
      fn(),
  revalidatePath,
  revalidateTag,
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

async function promoteSuperAdmin(email: string) {
  const db = getDb();
  await db
    .update(user)
    .set({ isSuperAdmin: true, emailVerified: true })
    .where(eq(user.email, email));
}

async function sessionUserId(cookie: string): Promise<string> {
  const sessionResponse = await verifyAuth(
    new Request(`${origin}/api/auth/get-session`, {
      headers: { cookie, origin },
    }),
  );
  expect(sessionResponse.status).toBe(200);
  const body = (await sessionResponse.json()) as { user: { id: string } };
  return body.user.id;
}

describe.skipIf(!hasDatabase || !hasAuthSecret)(
  "Super-admin Academies at the App Router seam",
  () => {
    const suffix = Date.now();
    const superAdminEmail = `super-${suffix}@example.com`;
    const ownerEmail = `owner-${suffix}@example.com`;
    const slug = `admin-academy-${suffix}`;
    let academyId = "";

    beforeEach(() => {
      enableMailCapture();
      sessionCookie.value = "";
      cookieJar.clear();
      revalidatePath.mockClear();
      revalidateTag.mockClear();
    });

    afterEach(async () => {
      disableMailCapture();
      clearCapturedMail();
      sessionCookie.value = "";
      cookieJar.clear();

      const db = getDb();
      const [row] = await db
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.slug, slug))
        .limit(1);
      if (row) {
        await db
          .delete(impersonationAuditEvents)
          .where(eq(impersonationAuditEvents.academyId, row.id));
        await db.delete(batches).where(eq(batches.academyId, row.id));
        await db.delete(academies).where(eq(academies.id, row.id));
      }
      await db.delete(user).where(eq(user.email, superAdminEmail));
      await db.delete(user).where(eq(user.email, ownerEmail));
    });

    it("creates an Academy with pending Owner email and lists it", async () => {
      const { GET: listAcademies, POST: createAcademy } = await import(
        "./route"
      );

      const superCookie = await signIn(superAdminEmail, "Super Admin");
      await promoteSuperAdmin(superAdminEmail);
      sessionCookie.value = superCookie;

      const createResponse = await createAcademy(
        new Request(`${origin}/api/admin/academies`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: superCookie,
          },
          body: JSON.stringify({
            name: "Admin Blitz Academy",
            slug,
            pendingOwnerEmail: ownerEmail,
          }),
        }),
      );
      expect(createResponse.status).toBe(200);
      const created = (await createResponse.json()) as { id: string };
      academyId = created.id;
      expect(academyId).toBeTruthy();

      const listResponse = await listAcademies(
        new Request(`${origin}/api/admin/academies`, {
          headers: { origin, cookie: superCookie },
        }),
      );
      expect(listResponse.status).toBe(200);
      const listed = (await listResponse.json()) as {
        academies: Array<{
          name: string;
          slug: string;
          ownerEmail: string | null;
          pendingOwnerEmail: string | null;
          createdAt: string;
        }>;
      };
      const row = listed.academies.find((item) => item.slug === slug);
      expect(row).toMatchObject({
        name: "Admin Blitz Academy",
        slug,
        ownerEmail: null,
        pendingOwnerEmail: ownerEmail,
      });
      expect(row?.createdAt).toBeTruthy();
    });

    it("lets the pending Owner claim via magic link", async () => {
      const { POST: createAcademy } = await import("./route");

      const superCookie = await signIn(superAdminEmail, "Super Admin");
      await promoteSuperAdmin(superAdminEmail);

      const createResponse = await createAcademy(
        new Request(`${origin}/api/admin/academies`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: superCookie,
          },
          body: JSON.stringify({
            name: "Admin Blitz Academy",
            slug,
            pendingOwnerEmail: ownerEmail,
          }),
        }),
      );
      expect(createResponse.status).toBe(200);

      const ownerCookie = await signIn(ownerEmail, "Pending Owner");
      const ownerId = await sessionUserId(ownerCookie);
      sessionCookie.value = ownerCookie;

      const AppLayout = (await import("@/app/app/layout")).default;
      renderToStaticMarkup(
        await AppLayout({
          children: createElement("div", null, "claimed"),
          params: Promise.resolve({}),
        }),
      );

      const owned = await getOwnedAcademy(ownerId);
      expect(owned?.slug).toBe(slug);
      expect(owned?.pendingOwnerEmail).toBeNull();
    });

    it("deactivates an Academy: brochure 404s, sitemap drops, purge runs; reactivate restores", async () => {
      const { POST: createAcademy } = await import("./route");
      const { POST: deactivateAcademy } = await import(
        "./[academyId]/deactivate/route"
      );
      const { POST: reactivateAcademy } = await import(
        "./[academyId]/reactivate/route"
      );
      const { claimPendingAcademy } = await import("@/lib/academy-claim");

      const superCookie = await signIn(superAdminEmail, "Super Admin");
      await promoteSuperAdmin(superAdminEmail);

      const createResponse = await createAcademy(
        new Request(`${origin}/api/admin/academies`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: superCookie,
          },
          body: JSON.stringify({
            name: "Admin Blitz Academy",
            slug,
            pendingOwnerEmail: ownerEmail,
          }),
        }),
      );
      expect(createResponse.status).toBe(200);
      const { id } = (await createResponse.json()) as { id: string };
      academyId = id;

      const ownerCookie = await signIn(ownerEmail, "Pending Owner");
      const ownerId = await sessionUserId(ownerCookie);
      await claimPendingAcademy(ownerId, ownerEmail);

      const liveHtml = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(liveHtml).toContain("Admin Blitz Academy");

      const sitemap = (await import("@/app/sitemap")).default;
      expect((await sitemap()).map((entry) => entry.url)).toContain(
        `${origin}/a/${slug}`,
      );

      const deactivateResponse = await deactivateAcademy(
        new Request(`${origin}/api/admin/academies/${id}/deactivate`, {
          method: "POST",
          headers: { origin, cookie: superCookie },
        }),
        { params: Promise.resolve({ academyId: id }) },
      );
      expect(deactivateResponse.status).toBe(200);
      expect(revalidateTag).toHaveBeenCalledWith(
        publicAcademyCacheTag(slug),
        "max",
      );
      expect(revalidatePath).toHaveBeenCalledWith(`/a/${slug}`);
      expect(revalidatePath).toHaveBeenCalledWith(`/a/${slug}/join`);

      await expect(
        AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

      expect((await sitemap()).map((entry) => entry.url)).not.toContain(
        `${origin}/a/${slug}`,
      );

      const db = getDb();
      const [row] = await db
        .select({ slug: academies.slug, isActive: academies.isActive })
        .from(academies)
        .where(eq(academies.id, id))
        .limit(1);
      expect(row).toMatchObject({ slug, isActive: false });

      revalidateTag.mockClear();
      revalidatePath.mockClear();

      const reactivateResponse = await reactivateAcademy(
        new Request(`${origin}/api/admin/academies/${id}/reactivate`, {
          method: "POST",
          headers: { origin, cookie: superCookie },
        }),
        { params: Promise.resolve({ academyId: id }) },
      );
      expect(reactivateResponse.status).toBe(200);
      expect(revalidateTag).toHaveBeenCalledWith(
        publicAcademyCacheTag(slug),
        "max",
      );

      const restoredHtml = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(restoredHtml).toContain("Admin Blitz Academy");
    });

    it("locks the Owner out of /app while the Academy is deactivated", async () => {
      const { POST: createAcademy } = await import("./route");
      const { POST: deactivateAcademy } = await import(
        "./[academyId]/deactivate/route"
      );
      const { claimPendingAcademy } = await import("@/lib/academy-claim");

      const superCookie = await signIn(superAdminEmail, "Super Admin");
      await promoteSuperAdmin(superAdminEmail);

      const createResponse = await createAcademy(
        new Request(`${origin}/api/admin/academies`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: superCookie,
          },
          body: JSON.stringify({
            name: "Admin Blitz Academy",
            slug,
            pendingOwnerEmail: ownerEmail,
          }),
        }),
      );
      const { id } = (await createResponse.json()) as { id: string };
      academyId = id;

      const ownerCookie = await signIn(ownerEmail, "Pending Owner");
      const ownerId = await sessionUserId(ownerCookie);
      await claimPendingAcademy(ownerId, ownerEmail);

      await deactivateAcademy(
        new Request(`${origin}/api/admin/academies/${id}/deactivate`, {
          method: "POST",
          headers: { origin, cookie: superCookie },
        }),
        { params: Promise.resolve({ academyId: id }) },
      );

      sessionCookie.value = ownerCookie;
      const AppLayout = (await import("@/app/app/layout")).default;
      const html = renderToStaticMarkup(
        await AppLayout({
          children: createElement("div", null, "should-not-see"),
          params: Promise.resolve({}),
        }),
      );
      expect(html).toContain("Academy deactivated — contact support");
      expect(html).not.toContain("should-not-see");
    });

    it("impersonates an Owner with banner and exits back to admin Academies", async () => {
      const { POST: createAcademy } = await import("./route");
      const { POST: startImpersonation } = await import(
        "./[academyId]/impersonate/route"
      );
      const { POST: exitImpersonation } = await import(
        "../impersonation/exit/route"
      );
      const { claimPendingAcademy } = await import("@/lib/academy-claim");
      const { POST: saveBrochure } = await import("@/app/api/brochure/route");

      const superCookie = await signIn(superAdminEmail, "Super Admin");
      await promoteSuperAdmin(superAdminEmail);

      const createResponse = await createAcademy(
        new Request(`${origin}/api/admin/academies`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: superCookie,
          },
          body: JSON.stringify({
            name: "Admin Blitz Academy",
            slug,
            pendingOwnerEmail: ownerEmail,
          }),
        }),
      );
      const { id } = (await createResponse.json()) as { id: string };
      academyId = id;

      const ownerCookie = await signIn(ownerEmail, "Pending Owner");
      const ownerId = await sessionUserId(ownerCookie);
      await claimPendingAcademy(ownerId, ownerEmail);

      sessionCookie.value = superCookie;
      const impersonateResponse = await startImpersonation(
        new Request(`${origin}/api/admin/academies/${id}/impersonate`, {
          method: "POST",
          headers: { origin, cookie: superCookie },
        }),
        { params: Promise.resolve({ academyId: id }) },
      );
      expect(impersonateResponse.status).toBe(200);

      const AppLayout = (await import("@/app/app/layout")).default;
      const DashboardPage = (await import("@/app/app/dashboard/page")).default;
      const bannerHtml = renderToStaticMarkup(
        await AppLayout({
          children: await DashboardPage(),
          params: Promise.resolve({}),
        }),
      );
      expect(bannerHtml).toContain("Impersonating");
      expect(bannerHtml).toContain(ownerEmail);
      expect(bannerHtml).toContain("Exit impersonation");
      expect(bannerHtml).toContain("Admin Blitz Academy");

      const brochureResponse = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: superCookie,
          },
          body: JSON.stringify({
            name: "Admin Blitz Academy",
            tagline: "Support edit",
            location: "Koramangala",
            phone: "",
          }),
        }),
      );
      expect(brochureResponse.status).toBe(200);

      const db = getDb();
      const audits = await db
        .select()
        .from(impersonationAuditEvents)
        .where(eq(impersonationAuditEvents.academyId, id));
      expect(audits.length).toBeGreaterThan(0);
      expect(audits[0]?.action).toBe("brochure.update");
      expect(audits[0]?.subjectUserId).toBe(ownerId);

      const exitResponse = await exitImpersonation(
        new Request(`${origin}/api/admin/impersonation/exit`, {
          method: "POST",
          headers: { origin, cookie: superCookie },
        }),
      );
      expect(exitResponse.status).toBe(200);
      const exitBody = (await exitResponse.json()) as { redirectTo: string };
      expect(exitBody.redirectTo).toBe("/app/admin/academies");

      const afterExit = renderToStaticMarkup(
        await AppLayout({
          children: createElement("div", null, "admin-home"),
          params: Promise.resolve({}),
        }),
      );
      expect(afterExit).not.toContain("Impersonating");
      expect(afterExit).toContain("admin-home");
    });
  },
);
