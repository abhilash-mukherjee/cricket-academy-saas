import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as verifyAuth, POST as authPost } from "../auth/[...all]/route";
import { POST as completeOnboarding } from "../onboarding/route";
import { POST as createBatch } from "./route";
import { PATCH as renameBatch } from "./[batchId]/route";
import { POST as createAdminAcademy } from "../admin/academies/route";
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
import { listBatches } from "@/lib/batches";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { claimPendingAcademy } from "@/lib/academy-claim";

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

const hasDatabase = Boolean(process.env.DATABASE_URL);
const hasAuthSecret = Boolean(process.env.BETTER_AUTH_SECRET);
const origin = "http://localhost:3000";

async function signInOwner(email: string, name = "New Owner"): Promise<string> {
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

async function onboardOwner(cookie: string, slug: string, batchName: string) {
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
        batchName,
      }),
    }),
  );
  expect(response.status).toBe(200);
}

async function sessionUserId(cookie: string): Promise<string> {
  const sessionResponse = await verifyAuth(
    new Request(`${origin}/api/auth/get-session`, {
      headers: {
        cookie,
        origin,
      },
    }),
  );
  expect(sessionResponse.status).toBe(200);
  const body = (await sessionResponse.json()) as { user: { id: string } };
  return body.user.id;
}

async function deleteAcademyBySlug(slug: string) {
  const db = getDb();
  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .where(eq(academies.slug, slug))
    .limit(1);
  if (!academy) {
    return;
  }
  await db.delete(batches).where(eq(batches.academyId, academy.id));
  await db.delete(academies).where(eq(academies.id, academy.id));
}

async function promoteSuperAdmin(email: string) {
  const db = getDb();
  await db
    .update(user)
    .set({ isSuperAdmin: true, emailVerified: true })
    .where(eq(user.email, email));
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
  "Owner Batches at the App Router seam",
  () => {
    const stamp = Date.now();
    const testEmail = `batches-owner-${stamp}@example.com`;
    const otherEmail = `batches-other-${stamp}@example.com`;
    const superAdminEmail = `batches-super-${stamp}@example.com`;
    const slug = `batches-${stamp}`;
    const otherSlug = `batches-other-${stamp}`;
    const emptySlug = `batches-empty-${stamp}`;

    beforeEach(() => {
      enableMailCapture();
      sessionCookie.value = "";
    });

    afterEach(async () => {
      disableMailCapture();
      clearCapturedMail();
      sessionCookie.value = "";
      await deleteOwnerByEmail(testEmail);
      await deleteOwnerByEmail(otherEmail);
      await deleteOwnerByEmail(superAdminEmail);
      await deleteAcademyBySlug(slug);
      await deleteAcademyBySlug(otherSlug);
      await deleteAcademyBySlug(emptySlug);
    });

    it("rejects a Batch name that matches another at the Academy after trim and case fold", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");

      const createResponse = await createBatch(
        new Request(`${origin}/api/batches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "  u-14 EVENING  " }),
        }),
      );
      expect(createResponse.status).toBe(409);
      await expect(createResponse.json()).resolves.toEqual({
        error: "name-taken",
      });

      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      expect(academy).toBeTruthy();
      await expect(listBatches(academy!.id)).resolves.toEqual([
        expect.objectContaining({ name: "U-14 evening" }),
      ]);
    });

    it("lets the Owner add a Batch after onboarding; new Batches start closed and list in created order", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");

      const createResponse = await createBatch(
        new Request(`${origin}/api/batches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "Weekend nets" }),
        }),
      );
      expect(createResponse.status).toBe(200);

      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      expect(academy).toBeTruthy();
      await expect(listBatches(academy!.id)).resolves.toEqual([
        expect.objectContaining({
          name: "U-14 evening",
          isOpenForRegistration: false,
        }),
        expect.objectContaining({
          name: "Weekend nets",
          isOpenForRegistration: false,
        }),
      ]);

      sessionCookie.value = cookie;
      const { default: BatchesPage } = await import("@/app/app/batches/page");
      const html = renderToStaticMarkup(await BatchesPage());
      const first = html.indexOf("U-14 evening");
      const second = html.indexOf("Weekend nets");
      expect(first).toBeGreaterThan(-1);
      expect(second).toBeGreaterThan(first);
      expect(html).not.toMatch(/delete/i);
    });

    it("lets the Owner rename a Batch and keeps the name as typed", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");

      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      expect(academy).toBeTruthy();
      const [batch] = await listBatches(academy!.id);
      expect(batch).toBeTruthy();

      const renameResponse = await renameBatch(
        new Request(`${origin}/api/batches/${batch!.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "  U-14 Evening  " }),
        }),
        { params: Promise.resolve({ batchId: batch!.id }) },
      );
      expect(renameResponse.status).toBe(200);

      await expect(listBatches(academy!.id)).resolves.toEqual([
        expect.objectContaining({ name: "U-14 Evening" }),
      ]);

      sessionCookie.value = cookie;
      const { default: BatchesPage } = await import("@/app/app/batches/page");
      const html = renderToStaticMarkup(await BatchesPage());
      expect(html).toContain("U-14 Evening");
      expect(html).not.toContain("U-14 evening");
    });

    it("rejects renaming a Batch to a name already used at the Academy", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");

      const createResponse = await createBatch(
        new Request(`${origin}/api/batches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "Weekend nets" }),
        }),
      );
      expect(createResponse.status).toBe(200);
      const created = (await createResponse.json()) as { id: string };

      const renameResponse = await renameBatch(
        new Request(`${origin}/api/batches/${created.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "u-14 evening" }),
        }),
        { params: Promise.resolve({ batchId: created.id }) },
      );
      expect(renameResponse.status).toBe(409);
      await expect(renameResponse.json()).resolves.toEqual({
        error: "name-taken",
      });

      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      expect(academy).toBeTruthy();
      await expect(listBatches(academy!.id)).resolves.toEqual([
        expect.objectContaining({ name: "U-14 evening" }),
        expect.objectContaining({ name: "Weekend nets" }),
      ]);
    });

    it("lets the Owner add the first Batch on a Super-admin-created Academy that has none", async () => {
      const superCookie = await signInOwner(superAdminEmail, "Super Admin");
      await promoteSuperAdmin(superAdminEmail);
      sessionCookie.value = superCookie;

      const createAcademyResponse = await createAdminAcademy(
        new Request(`${origin}/api/admin/academies`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: superCookie,
          },
          body: JSON.stringify({
            name: "Claimed Blitz Academy",
            slug: emptySlug,
            pendingOwnerEmail: testEmail,
          }),
        }),
      );
      expect(createAcademyResponse.status).toBe(200);

      const cookie = await signInOwner(testEmail);
      await claimPendingAcademy(await sessionUserId(cookie), testEmail);

      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      expect(academy).toBeTruthy();
      await expect(listBatches(academy!.id)).resolves.toEqual([]);

      const createResponse = await createBatch(
        new Request(`${origin}/api/batches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "U-16 morning" }),
        }),
      );
      expect(createResponse.status).toBe(200);

      await expect(listBatches(academy!.id)).resolves.toEqual([
        expect.objectContaining({
          name: "U-16 morning",
          isOpenForRegistration: false,
        }),
      ]);

      sessionCookie.value = cookie;
      const { default: BatchesPage } = await import("@/app/app/batches/page");
      const html = renderToStaticMarkup(await BatchesPage());
      expect(html).toContain("U-16 morning");
    });

    it("links Batches from dashboard setup next-steps, and add first Batch when none exist", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      sessionCookie.value = cookie;
      const { default: DashboardPage } = await import(
        "@/app/app/dashboard/page"
      );
      const withBatches = renderToStaticMarkup(await DashboardPage());
      expect(withBatches).toContain('href="/app/batches"');
      expect(withBatches).toContain("Batches");
      expect(withBatches).not.toContain("Add your first Batch");

      const superCookie = await signInOwner(superAdminEmail, "Super Admin");
      await promoteSuperAdmin(superAdminEmail);
      sessionCookie.value = superCookie;
      const createAcademyResponse = await createAdminAcademy(
        new Request(`${origin}/api/admin/academies`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: superCookie,
          },
          body: JSON.stringify({
            name: "Empty Blitz Academy",
            slug: emptySlug,
            pendingOwnerEmail: otherEmail,
          }),
        }),
      );
      expect(createAcademyResponse.status).toBe(200);

      const emptyCookie = await signInOwner(otherEmail, "Bala Sen");
      await claimPendingAcademy(await sessionUserId(emptyCookie), otherEmail);
      sessionCookie.value = emptyCookie;
      const emptyDashboard = renderToStaticMarkup(await DashboardPage());
      expect(emptyDashboard).toContain('href="/app/batches"');
      expect(emptyDashboard).toContain("Add your first Batch");
    });

    it("does not let an Owner rename a Batch on another Academy", async () => {
      const cookieA = await signInOwner(testEmail);
      await onboardOwner(cookieA, slug, "U-14 evening");
      const academyA = await getOwnedAcademy(await sessionUserId(cookieA));
      const [batchA] = await listBatches(academyA!.id);

      const cookieB = await signInOwner(otherEmail, "Bala Sen");
      await onboardOwner(cookieB, otherSlug, "Weekend nets");

      const renameResponse = await renameBatch(
        new Request(`${origin}/api/batches/${batchA!.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: cookieB,
          },
          body: JSON.stringify({ name: "Taken over" }),
        }),
        { params: Promise.resolve({ batchId: batchA!.id }) },
      );
      expect(renameResponse.status).toBe(404);

      await expect(listBatches(academyA!.id)).resolves.toEqual([
        expect.objectContaining({ name: "U-14 evening" }),
      ]);
    });
  },
);
