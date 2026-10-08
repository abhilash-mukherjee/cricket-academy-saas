import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { GET as verifyAuth, POST as authPost } from "../auth/[...all]/route";
import { POST as completeOnboarding } from "../onboarding/route";
import { renderToStaticMarkup } from "react-dom/server";
import AcademyBrochurePage from "@/app/a/[academySlug]/page";
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

async function signInOwner(email: string): Promise<string> {
  const signInResponse = await authPost(
    new Request(`${origin}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
      },
      body: JSON.stringify({
        email,
        name: "New Owner",
        callbackURL: "/app",
      }),
    }),
  );
  expect(signInResponse.status).toBe(200);

  const verifyUrl = extractFirstUrl(getCapturedMail()[0]?.html ?? "");
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

describe.skipIf(!hasDatabase || !hasAuthSecret)(
  "Owner onboarding at the App Router seam",
  () => {
    const testEmail = `owner-${Date.now()}@example.com`;
    const slug = `blitz-${Date.now()}`;

    beforeEach(() => {
      enableMailCapture();
      sessionCookie.value = "";
    });

    afterEach(async () => {
      disableMailCapture();
      clearCapturedMail();
      sessionCookie.value = "";

      const db = getDb();
      const [owner] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, testEmail))
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
      await db.delete(user).where(eq(user.email, testEmail));
    });

    it("makes Owner A's slug live with seeded brochure fields", async () => {
      const cookie = await signInOwner(testEmail);

      const onboardingResponse = await completeOnboarding(
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
            tagline: "Nets that make match-day simple",
            location: "Koramangala",
            phone: "+919876543210",
          }),
        }),
      );

      expect(onboardingResponse.status).toBe(200);
      await expect(onboardingResponse.json()).resolves.toEqual({ ok: true });

      const html = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(html).toContain("Blitz Cricket Academy");
      expect(html).toContain("Nets that make match-day simple");
      expect(html).toContain("Koramangala");
      expect(html).toContain("+919876543210");
    });

    it("starts the first Batch closed for Registration", async () => {
      const cookie = await signInOwner(testEmail);
      const onboardingResponse = await completeOnboarding(
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
      expect(onboardingResponse.status).toBe(200);

      const db = getDb();
      const [owner] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, testEmail))
        .limit(1);
      expect(owner).toBeTruthy();

      const academy = await getOwnedAcademy(owner!.id);
      expect(academy).toBeTruthy();

      await expect(listBatches(academy!.id)).resolves.toEqual([
        expect.objectContaining({
          name: "U-14 evening",
          isOpenForRegistration: false,
        }),
      ]);
    });

    it("does not let an Owner create a second Academy", async () => {
      const cookie = await signInOwner(testEmail);

      const first = await completeOnboarding(
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
      expect(first.status).toBe(200);

      const second = await completeOnboarding(
        new Request(`${origin}/api/onboarding`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            displayName: "Asha Rao",
            academyName: "Second Academy",
            slug: `${slug}-two`,
            batchName: "Weekend",
          }),
        }),
      );

      expect(second.status).toBe(409);

      await expect(
        AcademyBrochurePage({
          params: Promise.resolve({ academySlug: `${slug}-two` }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    });
  },
);
