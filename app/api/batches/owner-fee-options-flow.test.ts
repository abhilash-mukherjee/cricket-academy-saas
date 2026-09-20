import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as verifyAuth, POST as authPost } from "../auth/[...all]/route";
import { POST as completeOnboarding } from "../onboarding/route";
import { POST as createFeeOption } from "./[batchId]/fee-options/route";
import {
  PATCH as updateFeeOption,
  DELETE as deleteFeeOptionRoute,
} from "./[batchId]/fee-options/[feeOptionId]/route";
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
import { listFeeOptions } from "@/lib/batch-fee-options";
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
  "Owner fee options at the App Router seam",
  () => {
    const stamp = Date.now();
    const testEmail = `fee-owner-${stamp}@example.com`;
    const otherEmail = `fee-other-${stamp}@example.com`;
    const slug = `fee-options-${stamp}`;
    const otherSlug = `fee-options-other-${stamp}`;

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

    it("lets the Owner create a package they sell: days per week, term months, positive INR price, optional label", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");

      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      expect(academy).toBeTruthy();
      const [batch] = await listBatches(academy!.id);
      expect(batch).toBeTruthy();

      const createResponse = await createFeeOption(
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
            label: "  Weekday nets  ",
          }),
        }),
        { params: Promise.resolve({ batchId: batch!.id }) },
      );
      expect(createResponse.status).toBe(200);

      await expect(listFeeOptions(academy!.id)).resolves.toEqual([
        expect.objectContaining({
          batchId: batch!.id,
          daysPerWeek: 3,
          termMonths: 3,
          feePaise: 1500000,
          label: "Weekday nets",
          isOffered: true,
        }),
      ]);

      sessionCookie.value = cookie;
      const { default: BatchesPage } = await import("@/app/app/batches/page");
      const html = renderToStaticMarkup(await BatchesPage());
      expect(html).toContain("Weekday nets");
      expect(html).toContain("3 days per week");
      expect(html).toContain("3 months");
      expect(html).toContain("₹15,000");
    });

    it("rejects days per week outside 1–7, a non-positive term, and a non-positive INR price", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      const [batch] = await listBatches(academy!.id);

      const invalidBodies = [
        { daysPerWeek: 0, termMonths: 3, feeInr: 15000 },
        { daysPerWeek: 8, termMonths: 3, feeInr: 15000 },
        { daysPerWeek: 3, termMonths: 0, feeInr: 15000 },
        { daysPerWeek: 3, termMonths: 3, feeInr: 0 },
        { daysPerWeek: 3, termMonths: 3, feeInr: -100 },
      ];

      for (const body of invalidBodies) {
        const response = await createFeeOption(
          new Request(`${origin}/api/batches/${batch!.id}/fee-options`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin,
              cookie,
            },
            body: JSON.stringify(body),
          }),
          { params: Promise.resolve({ batchId: batch!.id }) },
        );
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
          error: "invalid-input",
        });
      }

      await expect(listFeeOptions(academy!.id)).resolves.toEqual([]);
    });

    it("rejects creating a second package with the same days per week and term on a Batch", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      const [batch] = await listBatches(academy!.id);

      const first = await createFeeOption(
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
      expect(first.status).toBe(200);

      const duplicate = await createFeeOption(
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
            feeInr: 18000,
            label: "Evening",
          }),
        }),
        { params: Promise.resolve({ batchId: batch!.id }) },
      );
      expect(duplicate.status).toBe(409);
      await expect(duplicate.json()).resolves.toEqual({
        error: "identity-taken",
      });

      await expect(listFeeOptions(academy!.id)).resolves.toEqual([
        expect.objectContaining({
          daysPerWeek: 3,
          termMonths: 3,
          feePaise: 1500000,
          label: null,
        }),
      ]);
    });

    it("lets the Owner change price, label, and sort order, but not days per week or term", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      const [batch] = await listBatches(academy!.id);

      const first = await createFeeOption(
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
      expect(first.status).toBe(200);
      const created = (await first.json()) as { id: string };

      const second = await createFeeOption(
        new Request(`${origin}/api/batches/${batch!.id}/fee-options`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            daysPerWeek: 5,
            termMonths: 6,
            feeInr: 28000,
          }),
        }),
        { params: Promise.resolve({ batchId: batch!.id }) },
      );
      expect(second.status).toBe(200);

      const updateResponse = await updateFeeOption(
        new Request(
          `${origin}/api/batches/${batch!.id}/fee-options/${created.id}`,
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              origin,
              cookie,
            },
            body: JSON.stringify({
              feeInr: 16500,
              label: "  Evening package  ",
              sortOrder: 4,
              daysPerWeek: 1,
              termMonths: 12,
            }),
          },
        ),
        {
          params: Promise.resolve({
            batchId: batch!.id,
            feeOptionId: created.id,
          }),
        },
      );
      expect(updateResponse.status).toBe(200);

      await expect(listFeeOptions(academy!.id)).resolves.toEqual([
        expect.objectContaining({
          daysPerWeek: 5,
          termMonths: 6,
          feePaise: 2800000,
        }),
        expect.objectContaining({
          id: created.id,
          daysPerWeek: 3,
          termMonths: 3,
          feePaise: 1650000,
          label: "Evening package",
          sortOrder: 4,
        }),
      ]);

      sessionCookie.value = cookie;
      const { default: BatchesPage } = await import("@/app/app/batches/page");
      const html = renderToStaticMarkup(await BatchesPage());
      expect(html).toContain("Evening package");
      expect(html).toContain("₹16,500");
      expect(html).not.toContain("Weekday nets");
    });

    it("lets the Owner stop offering a package and offer the same row again", async () => {
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
            termMonths: 3,
            feeInr: 15000,
            label: "Weekday nets",
          }),
        }),
        { params: Promise.resolve({ batchId: batch!.id }) },
      );
      const created = (await createdResponse.json()) as { id: string };

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
      expect(stopResponse.status).toBe(200);

      const duplicate = await createFeeOption(
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
      expect(duplicate.status).toBe(409);

      sessionCookie.value = cookie;
      const { default: BatchesPage } = await import("@/app/app/batches/page");
      const stoppedHtml = renderToStaticMarkup(await BatchesPage());
      expect(stoppedHtml).toContain("Weekday nets");
      expect(stoppedHtml).toContain("Not offered");

      const offerAgain = await updateFeeOption(
        new Request(
          `${origin}/api/batches/${batch!.id}/fee-options/${created.id}`,
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              origin,
              cookie,
            },
            body: JSON.stringify({ isOffered: true }),
          },
        ),
        {
          params: Promise.resolve({
            batchId: batch!.id,
            feeOptionId: created.id,
          }),
        },
      );
      expect(offerAgain.status).toBe(200);

      await expect(listFeeOptions(academy!.id)).resolves.toEqual([
        expect.objectContaining({
          id: created.id,
          isOffered: true,
          daysPerWeek: 3,
          termMonths: 3,
        }),
      ]);

      const offeredHtml = renderToStaticMarkup(await BatchesPage());
      expect(offeredHtml).toContain("Weekday nets");
      expect(offeredHtml).not.toContain("Not offered");
    });

    it("lets the Owner delete a fee option that no Registration references", async () => {
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
            daysPerWeek: 2,
            termMonths: 1,
            feeInr: 8000,
            label: "Starter",
          }),
        }),
        { params: Promise.resolve({ batchId: batch!.id }) },
      );
      const created = (await createdResponse.json()) as { id: string };

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
      expect(deleteResponse.status).toBe(200);

      await expect(listFeeOptions(academy!.id)).resolves.toEqual([]);

      sessionCookie.value = cookie;
      const { default: BatchesPage } = await import("@/app/app/batches/page");
      const html = renderToStaticMarkup(await BatchesPage());
      expect(html).not.toContain("Starter");
    });

    it("does not delete a fee option that a Registration references", async () => {
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
            termMonths: 3,
            feeInr: 15000,
            label: "Weekday nets",
          }),
        }),
        { params: Promise.resolve({ batchId: batch!.id }) },
      );
      const created = (await createdResponse.json()) as { id: string };

      const db = getDb();
      await db.insert(registrations).values({
        academyId: academy!.id,
        batchId: batch!.id,
        batchFeeOptionId: created.id,
        daysPerWeek: 3,
        termMonths: 3,
        feePaise: 1500000,
        playerFullName: "Ravi Kumar",
        playerFullNameNormalized: "ravi kumar",
        playerDateOfBirth: "2014-01-15",
        contactPhone: "+919876543210",
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
        error: "in-use",
      });

      await expect(listFeeOptions(academy!.id)).resolves.toEqual([
        expect.objectContaining({
          id: created.id,
          label: "Weekday nets",
        }),
      ]);
    });

    it("does not let an Owner change a fee option on another Academy", async () => {
      const cookieA = await signInOwner(testEmail);
      await onboardOwner(cookieA, slug, "U-14 evening");
      const academyA = await getOwnedAcademy(await sessionUserId(cookieA));
      const [batchA] = await listBatches(academyA!.id);

      const createdResponse = await createFeeOption(
        new Request(`${origin}/api/batches/${batchA!.id}/fee-options`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: cookieA,
          },
          body: JSON.stringify({
            daysPerWeek: 3,
            termMonths: 3,
            feeInr: 15000,
          }),
        }),
        { params: Promise.resolve({ batchId: batchA!.id }) },
      );
      const created = (await createdResponse.json()) as { id: string };

      const cookieB = await signInOwner(otherEmail, "Bala Sen");
      await onboardOwner(cookieB, otherSlug, "Weekend nets");

      const updateResponse = await updateFeeOption(
        new Request(
          `${origin}/api/batches/${batchA!.id}/fee-options/${created.id}`,
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              origin,
              cookie: cookieB,
            },
            body: JSON.stringify({ feeInr: 1 }),
          },
        ),
        {
          params: Promise.resolve({
            batchId: batchA!.id,
            feeOptionId: created.id,
          }),
        },
      );
      expect(updateResponse.status).toBe(404);

      const deleteResponse = await deleteFeeOptionRoute(
        new Request(
          `${origin}/api/batches/${batchA!.id}/fee-options/${created.id}`,
          {
            method: "DELETE",
            headers: { origin, cookie: cookieB },
          },
        ),
        {
          params: Promise.resolve({
            batchId: batchA!.id,
            feeOptionId: created.id,
          }),
        },
      );
      expect(deleteResponse.status).toBe(404);

      const createOnOther = await createFeeOption(
        new Request(`${origin}/api/batches/${batchA!.id}/fee-options`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: cookieB,
          },
          body: JSON.stringify({
            daysPerWeek: 2,
            termMonths: 1,
            feeInr: 5000,
          }),
        }),
        { params: Promise.resolve({ batchId: batchA!.id }) },
      );
      expect(createOnOther.status).toBe(404);

      await expect(listFeeOptions(academyA!.id)).resolves.toEqual([
        expect.objectContaining({
          id: created.id,
          feePaise: 1500000,
        }),
      ]);
    });

    it("links add a fee option from dashboard setup next-steps after the first Batch exists", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      sessionCookie.value = cookie;
      const { default: DashboardPage } = await import(
        "@/app/app/dashboard/page"
      );
      const beforeFee = renderToStaticMarkup(await DashboardPage());
      expect(beforeFee).toContain('href="/app/batches"');
      expect(beforeFee).toContain("Add a fee option");

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
          }),
        }),
        { params: Promise.resolve({ batchId: batch!.id }) },
      );
      expect(created.status).toBe(200);

      const afterFee = renderToStaticMarkup(await DashboardPage());
      expect(afterFee).toContain('href="/app/batches"');
      expect(afterFee).toContain("Fee options");
      expect(afterFee).not.toContain("Add a fee option");
    });
  },
);
