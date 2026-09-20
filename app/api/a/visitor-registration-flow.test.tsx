import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as verifyAuth, POST as authPost } from "../auth/[...all]/route";
import { POST as completeOnboarding } from "../onboarding/route";
import { POST as createFeeOption } from "../batches/[batchId]/fee-options/route";
import { PATCH as patchBatch } from "../batches/[batchId]/route";
import { PATCH as updateFeeOption } from "../batches/[batchId]/fee-options/[feeOptionId]/route";
import { POST as saveConversion } from "../conversion/route";
import ConversionPage from "@/app/a/[academySlug]/join/page";
import AcademyNotFound from "@/app/a/[academySlug]/not-found";
import { RegistrationThankYou } from "@/app/a/[academySlug]/join/registration-thank-you";
import {
  clearCapturedMail,
  disableMailCapture,
  enableMailCapture,
  extractFirstUrl,
  getCapturedMail,
} from "@/lib/mailer";
import {
  academies,
  batchFeeOptions,
  batches,
  registrations,
} from "@/db/domain-schema";
import { user } from "@/db/auth-schema";
import { getDb } from "@/db/client";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { listBatches } from "@/lib/batches";
import { ACADEMY_NOT_FOUND } from "@/lib/constants";
import { formatInr } from "@/lib/package-copy";

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

function isAcademyNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    error.digest === "NEXT_HTTP_ERROR_FALLBACK;404"
  );
}

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

async function openRegistrableBatch(
  cookie: string,
  slug: string,
  options: {
    daysPerWeek?: number;
    termMonths?: number;
    feeInr?: number;
    label?: string | null;
  } = {},
) {
  const academy = await getOwnedAcademy(await sessionUserId(cookie));
  expect(academy).toBeTruthy();
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
        daysPerWeek: options.daysPerWeek ?? 3,
        termMonths: options.termMonths ?? 3,
        feeInr: options.feeInr ?? 15000,
        label: options.label ?? "Weekday nets",
      }),
    }),
    { params: Promise.resolve({ batchId: batch!.id }) },
  );
  expect(created.status).toBe(200);
  const createdBody = (await created.json()) as { id: string };

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

  return {
    academy: academy!,
    batch: batch!,
    feeOptionId: createdBody.id,
  };
}

function postRegistration(
  slug: string,
  body: Record<string, unknown>,
) {
  return import("./[academySlug]/registrations/route").then(({ POST }) =>
    POST(new Request(`${origin}/api/a/${slug}/registrations`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(body),
    }), { params: Promise.resolve({ academySlug: slug }) }),
  );
}

const adultBody = {
  playerFullName: "Arjun Rao",
  playerDateOfBirth: "1990-06-15",
  playerPhone: "+919876543210",
  contactEmail: "arjun@example.com",
  note: "  Evening preferred.  ",
};

const childBody = {
  playerFullName: "Mini Rao",
  playerDateOfBirth: "2015-06-15",
  guardianFullName: "Asha Rao",
  guardianPhone: "+919876543210",
};

describe.skipIf(!hasDatabase || !hasAuthSecret)(
  "Visitor Registration at the App Router seam",
  () => {
    const stamp = Date.now();
    const testEmail = `reg-owner-${stamp}@example.com`;
    const slug = `reg-join-${stamp}`;

    beforeEach(() => {
      enableMailCapture();
      sessionCookie.value = "";
    });

    afterEach(async () => {
      disableMailCapture();
      clearCapturedMail();
      sessionCookie.value = "";
      await deleteOwnerByEmail(testEmail);
    });

    it("accepts a happy-path submit, snapshots the package, and omits a Registration id", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const opened = await openRegistrableBatch(cookie, slug);

      const response = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        ...adultBody,
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toEqual({
        ok: true,
        snapshot: {
          batchName: "U-14 evening",
          daysPerWeek: 3,
          termMonths: 3,
          feePaise: 1500000,
          contactPhone: "+919876543210",
          contactEmail: "arjun@example.com",
          label: "Weekday nets",
        },
      });
      expect(JSON.stringify(body)).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );

      const db = getDb();
      const [row] = await db
        .select()
        .from(registrations)
        .where(eq(registrations.academyId, opened.academy.id))
        .limit(1);
      expect(row).toMatchObject({
        batchId: opened.batch.id,
        batchFeeOptionId: opened.feeOptionId,
        daysPerWeek: 3,
        termMonths: 3,
        feePaise: 1500000,
        playerFullName: "Arjun Rao",
        playerFullNameNormalized: "arjun rao",
        playerDateOfBirth: "1990-06-15",
        playerPhone: "+919876543210",
        guardianFullName: null,
        guardianPhone: null,
        contactPhone: "+919876543210",
        contactEmail: "arjun@example.com",
        note: "Evening preferred.",
        status: "pending",
      });
    });

    it("requires Guardian name and phone under 18 and Player phone at 18+", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const opened = await openRegistrableBatch(cookie, slug);

      const missingGuardian = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        playerFullName: "Mini Rao",
        playerDateOfBirth: "2015-06-15",
        playerPhone: "+919876543210",
      });
      expect(missingGuardian.status).toBe(400);
      await expect(missingGuardian.json()).resolves.toEqual({
        error: "invalid-input",
      });

      const childOk = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        ...childBody,
      });
      expect(childOk.status).toBe(200);
      const childSnapshot = (await childOk.json()) as {
        snapshot: { contactPhone: string; contactEmail: string | null };
      };
      expect(childSnapshot.snapshot.contactPhone).toBe("+919876543210");
      expect(childSnapshot.snapshot.contactEmail).toBeNull();

      const db = getDb();
      const [childRow] = await db
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.academyId, opened.academy.id),
            eq(registrations.playerFullNameNormalized, "mini rao"),
          ),
        )
        .limit(1);
      expect(childRow).toMatchObject({
        guardianFullName: "Asha Rao",
        guardianPhone: "+919876543210",
        playerPhone: null,
        contactPhone: "+919876543210",
      });

      const adultGuardianOnly = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        playerFullName: "Arjun Rao",
        playerDateOfBirth: "1990-06-15",
        guardianFullName: "Asha Rao",
        guardianPhone: "+919876543210",
      });
      expect(adultGuardianOnly.status).toBe(400);
      await expect(adultGuardianOnly.json()).resolves.toEqual({
        error: "invalid-input",
      });
    });

    it("stores optional email when present and omits it when empty", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const opened = await openRegistrableBatch(cookie, slug);

      const withEmail = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        ...adultBody,
        playerFullName: "With Email",
        contactEmail: "  parent@example.com  ",
      });
      expect(withEmail.status).toBe(200);
      await expect(withEmail.json()).resolves.toMatchObject({
        snapshot: { contactEmail: "parent@example.com" },
      });

      const emptyEmail = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        ...adultBody,
        playerFullName: "No Email",
        contactEmail: "   ",
      });
      expect(emptyEmail.status).toBe(200);
      await expect(emptyEmail.json()).resolves.toMatchObject({
        snapshot: { contactEmail: null },
      });

      const omitted = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        playerFullName: "Omitted Email",
        playerDateOfBirth: adultBody.playerDateOfBirth,
        playerPhone: adultBody.playerPhone,
      });
      expect(omitted.status).toBe(200);
      await expect(omitted.json()).resolves.toMatchObject({
        snapshot: { contactEmail: null },
      });
    });

    it("blocks a duplicate pending Registration even with a different fee option or email", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const opened = await openRegistrableBatch(cookie, slug);
      const second = await createFeeOption(
        new Request(`${origin}/api/batches/${opened.batch.id}/fee-options`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            daysPerWeek: 5,
            termMonths: 6,
            feeInr: 22000,
            label: "Weekend",
          }),
        }),
        { params: Promise.resolve({ batchId: opened.batch.id }) },
      );
      expect(second.status).toBe(200);
      const secondBody = (await second.json()) as { id: string };

      const first = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        ...adultBody,
      });
      expect(first.status).toBe(200);

      const duplicateSame = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        ...adultBody,
        playerFullName: "  ARJUN RAO  ",
      });
      expect(duplicateSame.status).toBe(409);
      await expect(duplicateSame.json()).resolves.toEqual({
        error: "duplicate-pending",
      });

      const duplicateOtherPackage = await postRegistration(slug, {
        batchFeeOptionId: secondBody.id,
        ...adultBody,
        contactEmail: "other@example.com",
      });
      expect(duplicateOtherPackage.status).toBe(409);
      await expect(duplicateOtherPackage.json()).resolves.toEqual({
        error: "duplicate-pending",
      });
    });

    it("allows a sibling on the same phone and Batch", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const opened = await openRegistrableBatch(cookie, slug);

      const first = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        ...childBody,
      });
      expect(first.status).toBe(200);

      const sibling = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        ...childBody,
        playerFullName: "Kiran Rao",
      });
      expect(sibling.status).toBe(200);
    });

    it("accepts a submit when no UPI QR is uploaded", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const opened = await openRegistrableBatch(cookie, slug);
      expect(opened.academy.upiQrStorageKey).toBeFalsy();

      const response = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        ...adultBody,
      });
      expect(response.status).toBe(200);
    });

    it("rejects a stopped or unoffered package", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const opened = await openRegistrableBatch(cookie, slug);
      const second = await createFeeOption(
        new Request(`${origin}/api/batches/${opened.batch.id}/fee-options`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            daysPerWeek: 5,
            termMonths: 6,
            feeInr: 22000,
          }),
        }),
        { params: Promise.resolve({ batchId: opened.batch.id }) },
      );
      expect(second.status).toBe(200);
      const secondBody = (await second.json()) as { id: string };

      const close = await patchBatch(
        new Request(`${origin}/api/batches/${opened.batch.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ isOpenForRegistration: false }),
        }),
        { params: Promise.resolve({ batchId: opened.batch.id }) },
      );
      expect(close.status).toBe(200);

      const stop = await updateFeeOption(
        new Request(
          `${origin}/api/batches/${opened.batch.id}/fee-options/${opened.feeOptionId}`,
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
            batchId: opened.batch.id,
            feeOptionId: opened.feeOptionId,
          }),
        },
      );
      expect(stop.status).toBe(200);

      const reopen = await patchBatch(
        new Request(`${origin}/api/batches/${opened.batch.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ isOpenForRegistration: true }),
        }),
        { params: Promise.resolve({ batchId: opened.batch.id }) },
      );
      expect(reopen.status).toBe(200);

      const response = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        ...adultBody,
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: "intake-unavailable",
      });

      const stillOffered = await postRegistration(slug, {
        batchFeeOptionId: secondBody.id,
        ...adultBody,
      });
      expect(stillOffered.status).toBe(200);
    });

    it("rejects POST when online Registration is off, intake is closed, or the slug is deactivated", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const opened = await openRegistrableBatch(cookie, slug);

      const off = await saveConversion(
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
      expect(off.status).toBe(200);

      const flagOff = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        ...adultBody,
      });
      expect(flagOff.status).toBe(409);
      await expect(flagOff.json()).resolves.toEqual({
        error: "intake-unavailable",
      });

      const onAgain = await saveConversion(
        new Request(`${origin}/api/conversion`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ isOnlineRegistrationAllowed: true }),
        }),
      );
      expect(onAgain.status).toBe(200);

      const close = await patchBatch(
        new Request(`${origin}/api/batches/${opened.batch.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ isOpenForRegistration: false }),
        }),
        { params: Promise.resolve({ batchId: opened.batch.id }) },
      );
      expect(close.status).toBe(200);

      const closed = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        ...adultBody,
      });
      expect(closed.status).toBe(409);
      await expect(closed.json()).resolves.toEqual({
        error: "intake-unavailable",
      });

      const unknown = await postRegistration("no-such-academy", {
        batchFeeOptionId: opened.feeOptionId,
        ...adultBody,
      });
      expect(unknown.status).toBe(404);
      await expect(unknown.json()).resolves.toEqual({ error: "not-found" });

      const db = getDb();
      await db
        .update(academies)
        .set({ isActive: false })
        .where(eq(academies.id, opened.academy.id));

      const deactivated = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        ...adultBody,
      });
      expect(deactivated.status).toBe(404);
      await expect(deactivated.json()).resolves.toEqual({ error: "not-found" });

      await expect(
        ConversionPage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toSatisfy(isAcademyNotFound);
      expect(renderToStaticMarkup(<AcademyNotFound />)).toContain(
        ACADEMY_NOT_FOUND,
      );
    });

    it("shows Pending Registrations on the dashboard, including zero, with no inbox link", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      sessionCookie.value = cookie;
      const { default: DashboardPage } = await import(
        "@/app/app/dashboard/page"
      );

      const empty = renderToStaticMarkup(await DashboardPage());
      expect(empty).toContain("Pending Registrations: 0");
      expect(empty).not.toContain("/app/registrations");

      const opened = await openRegistrableBatch(cookie, slug);
      const submitted = await postRegistration(slug, {
        batchFeeOptionId: opened.feeOptionId,
        ...adultBody,
      });
      expect(submitted.status).toBe(200);

      const counted = renderToStaticMarkup(await DashboardPage());
      expect(counted).toContain("Pending Registrations: 1");
      expect(counted).not.toContain("/app/registrations");
    });

    it("lists package ids as a radio picker on /join and hides UPI until the last step", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const opened = await openRegistrableBatch(cookie, slug);
      await dbSetQr(opened.academy.id);

      const html = renderToStaticMarkup(
        await ConversionPage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(html).toContain("Register for a Batch.");
      expect(html).toContain("Player full name");
      expect(html).toContain("Date of birth");
      expect(html).toContain("Submit Registration");
      expect(html).toContain(`value="${opened.feeOptionId}"`);
      expect(html).toContain('type="radio"');
      expect(html).toContain("<form");
      expect(html).not.toMatch(/not a Registration form yet/i);
      expect(html).not.toContain("Pay with UPI");
      expect(html).not.toContain(`Pay ${formatInr(1500000)} with UPI`);
      expect(html).not.toContain("Guardian full name");
      expect(html).not.toContain("Player phone");
    });

    it("renders thank-you HTML from the snapshot and QR without a Registration id", async () => {
      const html = renderToStaticMarkup(
        <RegistrationThankYou
          snapshot={{
            batchName: "U-14 evening",
            daysPerWeek: 3,
            termMonths: 3,
            feePaise: 1500000,
            contactPhone: "+919876543210",
            contactEmail: "arjun@example.com",
            label: "Weekday nets",
          }}
          upiQrUrl="https://blob.test/academies/academy/upi-qr.png"
          onRegisterAnother={() => undefined}
        />,
      );
      expect(html).toContain("Thank you.");
      expect(html).toContain(
        "The Academy will contact you on +919876543210 and arjun@example.com.",
      );
      expect(html).toContain("U-14 evening");
      expect(html).toContain("Weekday nets");
      expect(html).toContain("3 days per week");
      expect(html).toContain("3 months");
      expect(html).toContain("₹15,000");
      expect(html).toContain(`Pay ${formatInr(1500000)} with UPI`);
      expect(html).toContain(
        encodeURIComponent("https://blob.test/academies/academy/upi-qr.png"),
      );
      expect(html).toContain("Register another Player");
      expect(html).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
    });
  },
);

async function dbSetQr(academyId: string) {
  const db = getDb();
  await db
    .update(academies)
    .set({ upiQrStorageKey: `academies/${academyId}/upi-qr.png` })
    .where(eq(academies.id, academyId));
}
