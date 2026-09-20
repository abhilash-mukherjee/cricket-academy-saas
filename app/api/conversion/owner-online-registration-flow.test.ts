import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as verifyAuth, POST as authPost } from "../auth/[...all]/route";
import { POST as completeOnboarding } from "../onboarding/route";
import { POST as saveConversion } from "./route";
import { POST as saveBrochure } from "../brochure/route";
import { POST as createFeeOption } from "../batches/[batchId]/fee-options/route";
import { PATCH as patchBatch } from "../batches/[batchId]/route";
import AcademyBrochurePage from "@/app/a/[academySlug]/page";
import ConversionPage from "@/app/a/[academySlug]/join/page";
import {
  clearCapturedMail,
  disableMailCapture,
  enableMailCapture,
  extractFirstUrl,
  getCapturedMail,
} from "@/lib/mailer";
import { academies, batchFeeOptions, batches, registrations } from "@/db/domain-schema";
import { user } from "@/db/auth-schema";
import { getDb } from "@/db/client";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { listBatches } from "@/lib/batches";

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
        phone: "+919876543210",
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
        .delete(registrations)
        .where(eq(registrations.academyId, academy.id));
      await db
        .delete(batchFeeOptions)
        .where(eq(batchFeeOptions.academyId, academy.id));
      await db.delete(batches).where(eq(batches.academyId, academy.id));
      await db.delete(academies).where(eq(academies.id, academy.id));
    }
  }
  await db.delete(user).where(eq(user.email, email));
}

describe.skipIf(!hasDatabase || !hasAuthSecret)(
  "Owner turns online Registration off at the App Router seam",
  () => {
    const stamp = Date.now();
    const testEmail = `online-reg-${stamp}@example.com`;
    const otherEmail = `online-reg-other-${stamp}@example.com`;
    const slug = `online-reg-${stamp}`;
    const otherSlug = `online-reg-other-${stamp}`;

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
    });

    it("defaults online Registration on and lets the Owner turn it off", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");

      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      expect(academy?.isOnlineRegistrationAllowed).toBe(true);

      sessionCookie.value = cookie;
      const { default: ConversionEditorPage } = await import(
        "@/app/app/conversion/page"
      );
      const onHtml = renderToStaticMarkup(await ConversionEditorPage());
      expect(onHtml).toContain("Online Registration");
      expect(onHtml).toMatch(/type="checkbox"[^>]*checked/);

      const saveResponse = await saveConversion(
        new Request(`${origin}/api/conversion`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ isOnlineRegistrationAllowed: false }),
        }),
      );
      expect(saveResponse.status).toBe(200);

      const after = await getOwnedAcademy(await sessionUserId(cookie));
      expect(after?.isOnlineRegistrationAllowed).toBe(false);

      const offHtml = renderToStaticMarkup(await ConversionEditorPage());
      expect(offHtml).toContain("Online Registration");
      expect(offHtml).not.toMatch(/type="checkbox"[^>]*checked/);
    });

    it("lets the Owner open a Batch while online Registration is off, and does not rewrite Batch rows when the flag turns off", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      const [batch] = await listBatches(academy!.id);

      const offResponse = await saveConversion(
        new Request(`${origin}/api/conversion`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ isOnlineRegistrationAllowed: false }),
        }),
      );
      expect(offResponse.status).toBe(200);

      const created = await createFeeOption(
        new Request(`${origin}/api/batches/${batch!.id}/fee-options`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            daysPerWeek: 3,
            termMonths: 3,
            feeInr: 15000,
          }),
        }),
        { params: Promise.resolve({ batchId: batch!.id }) },
      );
      expect(created.status).toBe(200);

      const openResponse = await patchBatch(
        new Request(`${origin}/api/batches/${batch!.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ isOpenForRegistration: true }),
        }),
        { params: Promise.resolve({ batchId: batch!.id }) },
      );
      expect(openResponse.status).toBe(200);

      await expect(listBatches(academy!.id)).resolves.toEqual([
        expect.objectContaining({
          name: "U-14 evening",
          isOpenForRegistration: true,
        }),
      ]);

      const stillOff = await saveConversion(
        new Request(`${origin}/api/conversion`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ isOnlineRegistrationAllowed: false }),
        }),
      );
      expect(stillOff.status).toBe(200);

      await expect(listBatches(academy!.id)).resolves.toEqual([
        expect.objectContaining({
          name: "U-14 evening",
          isOpenForRegistration: true,
        }),
      ]);
    });

    it("warns on Batches that visitors will not get a form until online Registration is on", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      sessionCookie.value = cookie;
      const { default: BatchesPage } = await import("@/app/app/batches/page");

      const onHtml = renderToStaticMarkup(await BatchesPage());
      expect(onHtml).not.toMatch(/visitors will not get a form/i);

      const offResponse = await saveConversion(
        new Request(`${origin}/api/conversion`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ isOnlineRegistrationAllowed: false }),
        }),
      );
      expect(offResponse.status).toBe(200);

      const offHtml = renderToStaticMarkup(await BatchesPage());
      expect(offHtml).toMatch(/visitors will not get a form/i);
      expect(offHtml).toContain("/app/conversion");
    });

    it("links conversion from dashboard setup next-steps and copies brochure and /join URLs even when gated", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      sessionCookie.value = cookie;
      const { default: DashboardPage } = await import(
        "@/app/app/dashboard/page"
      );

      const offResponse = await saveConversion(
        new Request(`${origin}/api/conversion`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ isOnlineRegistrationAllowed: false }),
        }),
      );
      expect(offResponse.status).toBe(200);

      const html = renderToStaticMarkup(await DashboardPage());
      expect(html).toContain('href="/app/conversion"');
      expect(html).toMatch(/UPI QR/i);
      expect(html).toMatch(/online Registration/i);
      expect(html).toContain(`/a/${slug}`);
      expect(html).toContain(`/a/${slug}/join`);
      expect(html).toContain("Brochure");
    });

    it("explains on /join when online Registration is off, with copy-phone and no form, QR, or Batch list", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      const [batch] = await listBatches(academy!.id);

      const created = await createFeeOption(
        new Request(`${origin}/api/batches/${batch!.id}/fee-options`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            daysPerWeek: 3,
            termMonths: 3,
            feeInr: 15000,
            label: "Weekday nets",
          }),
        }),
        { params: Promise.resolve({ batchId: batch!.id }) },
      );
      expect(created.status).toBe(200);

      const openResponse = await patchBatch(
        new Request(`${origin}/api/batches/${batch!.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ isOpenForRegistration: true }),
        }),
        { params: Promise.resolve({ batchId: batch!.id }) },
      );
      expect(openResponse.status).toBe(200);

      const offResponse = await saveConversion(
        new Request(`${origin}/api/conversion`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ isOnlineRegistrationAllowed: false }),
        }),
      );
      expect(offResponse.status).toBe(200);

      const joinHtml = renderToStaticMarkup(
        await ConversionPage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(joinHtml).toMatch(/online Registration is off/i);
      expect(joinHtml).not.toMatch(/intake is closed/i);
      expect(joinHtml).not.toContain("<form");
      expect(joinHtml).not.toContain("Pay with UPI");
      expect(joinHtml).not.toContain("U-14 evening");
      expect(joinHtml).not.toContain("Weekday nets");
      expect(joinHtml).toContain("Call to Register");
      expect(joinHtml).toContain("+919876543210");

      const brochureHtml = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(brochureHtml).toContain("Call to Register");
      expect(brochureHtml).not.toContain(`href="/a/${slug}/join"`);
    });

    it("omits the copy-phone CTA when online Registration is off and no phone is set", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");

      const brochureSave = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy",
            phone: "",
          }),
        }),
      );
      expect(brochureSave.status).toBe(200);

      const offResponse = await saveConversion(
        new Request(`${origin}/api/conversion`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ isOnlineRegistrationAllowed: false }),
        }),
      );
      expect(offResponse.status).toBe(200);

      const joinHtml = renderToStaticMarkup(
        await ConversionPage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(joinHtml).toMatch(/online Registration is off/i);
      expect(joinHtml).not.toContain("Call to Register");
      expect(joinHtml).not.toContain("<form");

      const brochureHtml = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(brochureHtml).not.toContain("Call to Register");
      expect(brochureHtml).not.toContain(`href="/a/${slug}/join"`);
    });

    it("does not let an Owner turn online Registration off on another Academy", async () => {
      const cookieA = await signInOwner(testEmail);
      await onboardOwner(cookieA, slug, "U-14 evening");
      const academyA = await getOwnedAcademy(await sessionUserId(cookieA));

      const cookieB = await signInOwner(otherEmail, "Bala Sen");
      await onboardOwner(cookieB, otherSlug, "Weekend nets");

      const offResponse = await saveConversion(
        new Request(`${origin}/api/conversion`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: cookieB,
          },
          body: JSON.stringify({ isOnlineRegistrationAllowed: false }),
        }),
      );
      expect(offResponse.status).toBe(200);

      const academyAAfter = await getOwnedAcademy(await sessionUserId(cookieA));
      expect(academyAAfter?.id).toBe(academyA!.id);
      expect(academyAAfter?.isOnlineRegistrationAllowed).toBe(true);

      const academyBAfter = await getOwnedAcademy(await sessionUserId(cookieB));
      expect(academyBAfter?.isOnlineRegistrationAllowed).toBe(false);
    });
  },
);
