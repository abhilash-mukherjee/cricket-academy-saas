import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as verifyAuth, POST as authPost } from "../auth/[...all]/route";
import { POST as completeOnboarding } from "../onboarding/route";
import { POST as createBatch } from "./route";
import { POST as createFeeOption } from "./[batchId]/fee-options/route";
import {
  PATCH as updateFeeOption,
  DELETE as deleteFeeOptionRoute,
} from "./[batchId]/fee-options/[feeOptionId]/route";
import { PATCH as patchBatch } from "./[batchId]/route";
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
import { listBatches } from "@/lib/batches";
import { getOwnedAcademy } from "@/lib/owner-onboarding";

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
  "Owner opens a Batch at the App Router seam",
  () => {
    const stamp = Date.now();
    const testEmail = `batch-open-${stamp}@example.com`;
    const otherEmail = `batch-open-other-${stamp}@example.com`;
    const slug = `batch-open-${stamp}`;
    const otherSlug = `batch-open-other-${stamp}`;

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

    it("does not open a Batch that has no offered fee option", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");

      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      const [batch] = await listBatches(academy!.id);
      expect(batch).toBeTruthy();

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
      expect(openResponse.status).toBe(409);
      await expect(openResponse.json()).resolves.toEqual({
        error: "no-offered-package",
      });

      await expect(listBatches(academy!.id)).resolves.toEqual([
        expect.objectContaining({
          name: "U-14 evening",
          isOpenForRegistration: false,
        }),
      ]);
    });

    it("lets the Owner open a Batch after it has an offered fee option", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");

      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      const [batch] = await listBatches(academy!.id);
      expect(batch).toBeTruthy();

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
            termDays: 3,
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

      await expect(listBatches(academy!.id)).resolves.toEqual([
        expect.objectContaining({
          name: "U-14 evening",
          isOpenForRegistration: true,
        }),
      ]);

      sessionCookie.value = cookie;
      const { default: BatchesPage } = await import("@/app/app/batches/page");
      const html = renderToStaticMarkup(await BatchesPage());
      expect(html).toContain("Open for Registration");
      expect(html).toContain("Close for Registration");
    });

    it("lets the Owner close an open Batch", async () => {
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
            termDays: 3,
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

      const closeResponse = await patchBatch(
        new Request(`${origin}/api/batches/${batch!.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ isOpenForRegistration: false }),
        }),
        { params: Promise.resolve({ batchId: batch!.id }) },
      );
      expect(closeResponse.status).toBe(200);

      await expect(listBatches(academy!.id)).resolves.toEqual([
        expect.objectContaining({
          name: "U-14 evening",
          isOpenForRegistration: false,
        }),
      ]);
    });

    it("refuses to stop offering or delete the last offered package while the Batch is open", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      const [batch] = await listBatches(academy!.id);

      const createdResponse = await createFeeOption(
        new Request(`${origin}/api/batches/${batch!.id}/fee-options`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            daysPerWeek: 3,
            termDays: 3,
            feeInr: 15000,
            label: "Weekday nets",
          }),
        }),
        { params: Promise.resolve({ batchId: batch!.id }) },
      );
      const created = (await createdResponse.json()) as { id: string };

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

      const stopResponse = await updateFeeOption(
        new Request(
          `${origin}/api/batches/${batch!.id}/fee-options/${created.id}`,
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              origin,
              cookie,
            },
            body: JSON.stringify({ isOffered: false }),
          },
        ),
        {
          params: Promise.resolve({
            batchId: batch!.id,
            feeOptionId: created.id,
          }),
        },
      );
      expect(stopResponse.status).toBe(409);
      await expect(stopResponse.json()).resolves.toEqual({
        error: "close-first",
      });

      const deleteResponse = await deleteFeeOptionRoute(
        new Request(
          `${origin}/api/batches/${batch!.id}/fee-options/${created.id}`,
          {
            method: "DELETE",
            headers: { origin, cookie },
          },
        ),
        {
          params: Promise.resolve({
            batchId: batch!.id,
            feeOptionId: created.id,
          }),
        },
      );
      expect(deleteResponse.status).toBe(409);
      await expect(deleteResponse.json()).resolves.toEqual({
        error: "close-first",
      });

      await expect(listBatches(academy!.id)).resolves.toEqual([
        expect.objectContaining({ isOpenForRegistration: true }),
      ]);
    });

    it("shows intake is closed on /join for closed-only Batches, with a brochure link and copy-phone CTA", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");

      const joinHtml = renderToStaticMarkup(
        await ConversionPage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(joinHtml).toMatch(/intake is closed/i);
      expect(joinHtml).toContain(`href="/a/${slug}"`);
      expect(joinHtml).not.toContain("<form");
      expect(joinHtml).not.toContain("Pay with UPI");
      expect(joinHtml).not.toContain("+919876543210");

      const brochureHtml = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(brochureHtml).toContain("Call to Register");
      expect(brochureHtml).not.toContain(`href="/a/${slug}/join"`);
    });

    it("lists only the opened Batch and its offered package on /join, with a Register CTA", async () => {
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
            termDays: 45,
            feeInr: 15000,
            label: "Weekday nets",
          }),
        }),
        { params: Promise.resolve({ batchId: batch!.id }) },
      );
      expect(created.status).toBe(200);

      const closedOpen = await patchBatch(
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
      expect(closedOpen.status).toBe(200);

      const joinHtml = renderToStaticMarkup(
        await ConversionPage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(joinHtml).toContain("U-14 evening");
      expect(joinHtml.indexOf("Weekday nets")).toBeLessThan(
        joinHtml.indexOf("3 days per week · 45 days · ₹15,000"),
      );
      expect(joinHtml).toContain("3 days per week · 45 days · ₹15,000");
      expect(joinHtml).toContain("Register for a Batch.");
      expect(joinHtml).toContain("<form");
      expect(joinHtml).not.toMatch(/not a Registration form yet/i);
      expect(joinHtml).not.toMatch(/intake is closed/i);

      const brochureHtml = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(brochureHtml).toContain("Register");
      expect(brochureHtml).toContain(`/a/${slug}/join`);
    });

    it("links open a Batch from dashboard setup next-steps after a fee option exists", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      sessionCookie.value = cookie;
      const { default: DashboardPage } = await import(
        "@/app/app/dashboard/page"
      );

      const beforeFee = renderToStaticMarkup(await DashboardPage());
      expect(beforeFee).not.toContain("Open a Batch");

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
            termDays: 3,
            feeInr: 15000,
          }),
        }),
        { params: Promise.resolve({ batchId: batch!.id }) },
      );
      expect(created.status).toBe(200);

      const afterFee = renderToStaticMarkup(await DashboardPage());
      expect(afterFee).toContain("Open a Batch");
      expect(afterFee).toContain('href="/app/batches"');

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

      const afterOpen = renderToStaticMarkup(await DashboardPage());
      expect(afterOpen).not.toContain("Open a Batch");
    });

    it("does not let an Owner open a Batch on another Academy", async () => {
      const cookieA = await signInOwner(testEmail);
      await onboardOwner(cookieA, slug, "U-14 evening");
      const academyA = await getOwnedAcademy(await sessionUserId(cookieA));
      const [batchA] = await listBatches(academyA!.id);

      const created = await createFeeOption(
        new Request(`${origin}/api/batches/${batchA!.id}/fee-options`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: cookieA,
          },
          body: JSON.stringify({
            daysPerWeek: 3,
            termDays: 3,
            feeInr: 15000,
          }),
        }),
        { params: Promise.resolve({ batchId: batchA!.id }) },
      );
      expect(created.status).toBe(200);

      const cookieB = await signInOwner(otherEmail, "Bala Sen");
      await onboardOwner(cookieB, otherSlug, "Weekend nets");

      const openResponse = await patchBatch(
        new Request(`${origin}/api/batches/${batchA!.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: cookieB,
          },
          body: JSON.stringify({ isOpenForRegistration: true }),
        }),
        { params: Promise.resolve({ batchId: batchA!.id }) },
      );
      expect(openResponse.status).toBe(404);

      await expect(listBatches(academyA!.id)).resolves.toEqual([
        expect.objectContaining({
          name: "U-14 evening",
          isOpenForRegistration: false,
        }),
      ]);
    });

    it("does not list a closed Batch or a package that is not offered on /join", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      const [openBatch] = await listBatches(academy!.id);

      const offered = await createFeeOption(
        new Request(`${origin}/api/batches/${openBatch!.id}/fee-options`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            daysPerWeek: 3,
            termDays: 3,
            feeInr: 15000,
            label: "Weekday nets",
          }),
        }),
        { params: Promise.resolve({ batchId: openBatch!.id }) },
      );
      expect(offered.status).toBe(200);

      const hidden = await createFeeOption(
        new Request(`${origin}/api/batches/${openBatch!.id}/fee-options`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            daysPerWeek: 1,
            termDays: 1,
            feeInr: 4000,
            label: "Hidden package",
          }),
        }),
        { params: Promise.resolve({ batchId: openBatch!.id }) },
      );
      const hiddenOption = (await hidden.json()) as { id: string };

      await updateFeeOption(
        new Request(
          `${origin}/api/batches/${openBatch!.id}/fee-options/${hiddenOption.id}`,
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              origin,
              cookie,
            },
            body: JSON.stringify({ isOffered: false }),
          },
        ),
        {
          params: Promise.resolve({
            batchId: openBatch!.id,
            feeOptionId: hiddenOption.id,
          }),
        },
      );

      const closedCreate = await createBatch(
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
      expect(closedCreate.status).toBe(200);
      const closedBatch = (await closedCreate.json()) as { id: string };

      const closedFee = await createFeeOption(
        new Request(`${origin}/api/batches/${closedBatch.id}/fee-options`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            daysPerWeek: 2,
            termDays: 1,
            feeInr: 8000,
            label: "Closed package",
          }),
        }),
        { params: Promise.resolve({ batchId: closedBatch.id }) },
      );
      expect(closedFee.status).toBe(200);

      const openResponse = await patchBatch(
        new Request(`${origin}/api/batches/${openBatch!.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ isOpenForRegistration: true }),
        }),
        { params: Promise.resolve({ batchId: openBatch!.id }) },
      );
      expect(openResponse.status).toBe(200);

      const joinHtml = renderToStaticMarkup(
        await ConversionPage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(joinHtml).toContain("U-14 evening");
      expect(joinHtml).toContain("Weekday nets");
      expect(joinHtml).not.toContain("Hidden package");
      expect(joinHtml).not.toContain("Weekend nets");
      expect(joinHtml).not.toContain("Closed package");
    });
  },
);
