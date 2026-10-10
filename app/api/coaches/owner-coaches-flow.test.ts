import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as verifyAuth, POST as authPost } from "../auth/[...all]/route";
import { POST as completeOnboarding } from "../onboarding/route";
import { POST as createAdminAcademy } from "../admin/academies/route";
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
  coachAttendance,
  coaches,
  impersonationAuditEvents,
} from "@/db/domain-schema";
import { user } from "@/db/auth-schema";
import { getDb } from "@/db/client";
import { listCoaches } from "@/lib/coaches";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { claimPendingAcademy } from "@/lib/academy-claim";

const sessionCookie = vi.hoisted(() => ({ value: "" }));
const cookieJar = vi.hoisted(() => new Map<string, string>());

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
  await db
    .delete(coachAttendance)
    .where(eq(coachAttendance.academyId, academy.id));
  await db.delete(coaches).where(eq(coaches.academyId, academy.id));
  await db
    .delete(impersonationAuditEvents)
    .where(eq(impersonationAuditEvents.academyId, academy.id));
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
      await db
        .delete(coachAttendance)
        .where(eq(coachAttendance.academyId, academy.id));
      await db.delete(coaches).where(eq(coaches.academyId, academy.id));
      await db
        .delete(impersonationAuditEvents)
        .where(eq(impersonationAuditEvents.academyId, academy.id));
      await db.delete(batches).where(eq(batches.academyId, academy.id));
      await db.delete(academies).where(eq(academies.id, academy.id));
    }
  }
  await db.delete(user).where(eq(user.email, email));
}

describe.skipIf(!hasDatabase || !hasAuthSecret)(
  "Owner Coaches at the App Router seam",
  () => {
    const stamp = Date.now();
    const testEmail = `coaches-owner-${stamp}@example.com`;
    const otherEmail = `coaches-other-${stamp}@example.com`;
    const superAdminEmail = `coaches-super-${stamp}@example.com`;
    const slug = `coaches-${stamp}`;
    const otherSlug = `coaches-other-${stamp}`;
    const emptySlug = `coaches-empty-${stamp}`;

    beforeEach(() => {
      enableMailCapture();
      sessionCookie.value = "";
      cookieJar.clear();
    });

    afterEach(async () => {
      disableMailCapture();
      clearCapturedMail();
      sessionCookie.value = "";
      cookieJar.clear();
      await deleteOwnerByEmail(testEmail);
      await deleteOwnerByEmail(otherEmail);
      await deleteOwnerByEmail(superAdminEmail);
      await deleteAcademyBySlug(slug);
      await deleteAcademyBySlug(otherSlug);
      await deleteAcademyBySlug(emptySlug);
    });

    it("lets the Owner add Coaches; list is A–Z; another Academy's Coaches stay out", async () => {
      const { POST: createCoach } = await import("./route");

      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");

      const zebra = await createCoach(
        new Request(`${origin}/api/coaches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "  Zara Khan  " }),
        }),
      );
      expect(zebra.status).toBe(200);

      const anil = await createCoach(
        new Request(`${origin}/api/coaches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "Anil Mehta" }),
        }),
      );
      expect(anil.status).toBe(200);

      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      expect(academy).toBeTruthy();
      await expect(listCoaches(academy!.id)).resolves.toEqual([
        expect.objectContaining({ name: "Anil Mehta" }),
        expect.objectContaining({ name: "Zara Khan" }),
      ]);

      const cookieB = await signInOwner(otherEmail, "Bala Sen");
      await onboardOwner(cookieB, otherSlug, "Weekend nets");
      const otherAdd = await createCoach(
        new Request(`${origin}/api/coaches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: cookieB,
          },
          body: JSON.stringify({ name: "Priya Nair" }),
        }),
      );
      expect(otherAdd.status).toBe(200);

      await expect(listCoaches(academy!.id)).resolves.toEqual([
        expect.objectContaining({ name: "Anil Mehta" }),
        expect.objectContaining({ name: "Zara Khan" }),
      ]);

      sessionCookie.value = cookie;
      const { default: CoachesPage } = await import("@/app/app/coaches/page");
      const html = renderToStaticMarkup(await CoachesPage());
      const anilAt = html.indexOf("Anil Mehta");
      const zaraAt = html.indexOf("Zara Khan");
      expect(anilAt).toBeGreaterThan(-1);
      expect(zaraAt).toBeGreaterThan(anilAt);
      expect(html).toContain('href="/app/coaches/');
      expect(html).not.toContain("Priya Nair");
      expect(html).toContain("Add");
    });

    it("rejects blank, over-long, and case-insensitive duplicate names without changing the list", async () => {
      const { POST: createCoach } = await import("./route");

      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");

      const first = await createCoach(
        new Request(`${origin}/api/coaches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "Priya Nair" }),
        }),
      );
      expect(first.status).toBe(200);

      const blank = await createCoach(
        new Request(`${origin}/api/coaches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "   " }),
        }),
      );
      expect(blank.status).toBe(400);
      await expect(blank.json()).resolves.toEqual({ error: "invalid-input" });

      const tooLong = await createCoach(
        new Request(`${origin}/api/coaches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "a".repeat(201) }),
        }),
      );
      expect(tooLong.status).toBe(400);
      await expect(tooLong.json()).resolves.toEqual({
        error: "invalid-input",
      });

      const duplicate = await createCoach(
        new Request(`${origin}/api/coaches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "  priya NAIR  " }),
        }),
      );
      expect(duplicate.status).toBe(409);
      await expect(duplicate.json()).resolves.toEqual({
        error: "name-taken",
      });

      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      await expect(listCoaches(academy!.id)).resolves.toEqual([
        expect.objectContaining({ name: "Priya Nair" }),
      ]);
    });

    it("lets the Owner rename a Coach, including case-only; collisions leave the stored name", async () => {
      const { POST: createCoach } = await import("./route");
      const { PATCH: renameCoach } = await import("./[coachId]/route");

      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");

      const priya = await createCoach(
        new Request(`${origin}/api/coaches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "Priya" }),
        }),
      );
      expect(priya.status).toBe(200);
      const { id: priyaId } = (await priya.json()) as { id: string };

      const anil = await createCoach(
        new Request(`${origin}/api/coaches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "Anil" }),
        }),
      );
      expect(anil.status).toBe(200);
      const { id: anilId } = (await anil.json()) as { id: string };

      const caseOnly = await renameCoach(
        new Request(`${origin}/api/coaches/${priyaId}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "  PRIYA  " }),
        }),
        { params: Promise.resolve({ coachId: priyaId }) },
      );
      expect(caseOnly.status).toBe(200);

      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      await expect(listCoaches(academy!.id)).resolves.toEqual([
        expect.objectContaining({ id: anilId, name: "Anil" }),
        expect.objectContaining({ id: priyaId, name: "PRIYA" }),
      ]);

      const collision = await renameCoach(
        new Request(`${origin}/api/coaches/${anilId}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "priya" }),
        }),
        { params: Promise.resolve({ coachId: anilId }) },
      );
      expect(collision.status).toBe(409);
      await expect(collision.json()).resolves.toEqual({
        error: "name-taken",
      });

      await expect(listCoaches(academy!.id)).resolves.toEqual([
        expect.objectContaining({ id: anilId, name: "Anil" }),
        expect.objectContaining({ id: priyaId, name: "PRIYA" }),
      ]);

      sessionCookie.value = cookie;
      const { default: CoachPage } = await import(
        "@/app/app/coaches/[coachId]/page"
      );
      const html = renderToStaticMarkup(
        await CoachPage({ params: Promise.resolve({ coachId: priyaId }) }),
      );
      expect(html).toContain("PRIYA");
      expect(html).toContain('href="/app/coaches"');
    });

    it("deletes a Coach with no body and lets that name be added again", async () => {
      const { POST: createCoach } = await import("./route");
      const { DELETE: deleteCoach } = await import("./[coachId]/route");

      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");

      const created = await createCoach(
        new Request(`${origin}/api/coaches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "Zara Khan" }),
        }),
      );
      expect(created.status).toBe(200);
      const { id } = (await created.json()) as { id: string };

      const removed = await deleteCoach(
        new Request(`${origin}/api/coaches/${id}`, {
          method: "DELETE",
          headers: { origin, cookie },
        }),
        { params: Promise.resolve({ coachId: id }) },
      );
      expect(removed.status).toBe(200);

      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      await expect(listCoaches(academy!.id)).resolves.toEqual([]);

      const again = await createCoach(
        new Request(`${origin}/api/coaches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "Zara Khan" }),
        }),
      );
      expect(again.status).toBe(200);
      await expect(listCoaches(academy!.id)).resolves.toEqual([
        expect.objectContaining({ name: "Zara Khan" }),
      ]);
    });

    it("lets the Owner add, rename, and remove a Coach when the Academy has no Batches", async () => {
      const { POST: createCoach } = await import("./route");
      const { PATCH: renameCoach, DELETE: deleteCoach } = await import(
        "./[coachId]/route"
      );

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
            name: "Empty Coach Academy",
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

      const created = await createCoach(
        new Request(`${origin}/api/coaches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "Solo Coach" }),
        }),
      );
      expect(created.status).toBe(200);
      const { id } = (await created.json()) as { id: string };

      const renamed = await renameCoach(
        new Request(`${origin}/api/coaches/${id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ name: "Solo Coach Renamed" }),
        }),
        { params: Promise.resolve({ coachId: id }) },
      );
      expect(renamed.status).toBe(200);

      await expect(listCoaches(academy!.id)).resolves.toEqual([
        expect.objectContaining({ name: "Solo Coach Renamed" }),
      ]);

      const removed = await deleteCoach(
        new Request(`${origin}/api/coaches/${id}`, {
          method: "DELETE",
          headers: { origin, cookie },
        }),
        { params: Promise.resolve({ coachId: id }) },
      );
      expect(removed.status).toBe(200);
      await expect(listCoaches(academy!.id)).resolves.toEqual([]);
    });

    it("audits an impersonated success and skips audit on failure", async () => {
      const { POST: createCoach } = await import("./route");
      const { POST: startImpersonation } = await import(
        "../admin/academies/[academyId]/impersonate/route"
      );

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
            name: "Audit Coach Academy",
            slug,
            pendingOwnerEmail: testEmail,
          }),
        }),
      );
      expect(createAcademyResponse.status).toBe(200);
      const { id: academyId } = (await createAcademyResponse.json()) as {
        id: string;
      };

      const ownerCookie = await signInOwner(testEmail);
      const ownerId = await sessionUserId(ownerCookie);
      await claimPendingAcademy(ownerId, testEmail);

      sessionCookie.value = superCookie;
      const impersonateResponse = await startImpersonation(
        new Request(`${origin}/api/admin/academies/${academyId}/impersonate`, {
          method: "POST",
          headers: { origin, cookie: superCookie },
        }),
        { params: Promise.resolve({ academyId }) },
      );
      expect(impersonateResponse.status).toBe(200);

      const db = getDb();
      await db
        .delete(impersonationAuditEvents)
        .where(eq(impersonationAuditEvents.academyId, academyId));

      const failed = await createCoach(
        new Request(`${origin}/api/coaches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: superCookie,
          },
          body: JSON.stringify({ name: "   " }),
        }),
      );
      expect(failed.status).toBe(400);

      const afterFail = await db
        .select()
        .from(impersonationAuditEvents)
        .where(eq(impersonationAuditEvents.academyId, academyId));
      expect(afterFail).toEqual([]);

      const success = await createCoach(
        new Request(`${origin}/api/coaches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: superCookie,
          },
          body: JSON.stringify({ name: "Impersonated Coach" }),
        }),
      );
      expect(success.status).toBe(200);
      const { id: coachId } = (await success.json()) as { id: string };

      const audits = await db
        .select()
        .from(impersonationAuditEvents)
        .where(eq(impersonationAuditEvents.academyId, academyId));
      expect(audits).toEqual([
        expect.objectContaining({
          action: "coach.add",
          subjectUserId: ownerId,
          metadata: { coachId },
        }),
      ]);
    });

    it("does not let an Owner rename or remove a Coach on another Academy", async () => {
      const { POST: createCoach } = await import("./route");
      const { PATCH: renameCoach, DELETE: deleteCoach } = await import(
        "./[coachId]/route"
      );

      const cookieA = await signInOwner(testEmail);
      await onboardOwner(cookieA, slug, "U-14 evening");
      const created = await createCoach(
        new Request(`${origin}/api/coaches`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: cookieA,
          },
          body: JSON.stringify({ name: "Owned Coach" }),
        }),
      );
      const { id } = (await created.json()) as { id: string };

      const cookieB = await signInOwner(otherEmail, "Bala Sen");
      await onboardOwner(cookieB, otherSlug, "Weekend nets");

      const renameResponse = await renameCoach(
        new Request(`${origin}/api/coaches/${id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: cookieB,
          },
          body: JSON.stringify({ name: "Taken over" }),
        }),
        { params: Promise.resolve({ coachId: id }) },
      );
      expect(renameResponse.status).toBe(404);

      const deleteResponse = await deleteCoach(
        new Request(`${origin}/api/coaches/${id}`, {
          method: "DELETE",
          headers: { origin, cookie: cookieB },
        }),
        { params: Promise.resolve({ coachId: id }) },
      );
      expect(deleteResponse.status).toBe(404);

      const academyA = await getOwnedAcademy(await sessionUserId(cookieA));
      await expect(listCoaches(academyA!.id)).resolves.toEqual([
        expect.objectContaining({ name: "Owned Coach" }),
      ]);
    });
  },
);
