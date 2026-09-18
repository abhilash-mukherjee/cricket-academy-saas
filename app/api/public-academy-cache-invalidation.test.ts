import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as verifyAuth, POST as authPost } from "./auth/[...all]/route";
import { POST as completeOnboarding } from "./onboarding/route";
import { POST as saveBrochure } from "./brochure/route";
import { POST as saveConversion } from "./conversion/route";
import { POST as uploadAsset } from "./academy-assets/upload/route";
import AcademyBrochurePage from "@/app/a/[academySlug]/page";
import ConversionPage from "@/app/a/[academySlug]/join/page";
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
  batchFeeOptions,
  brochureImages,
  coachProfiles,
  youtubeEmbeds,
} from "@/db/domain-schema";
import { user } from "@/db/auth-schema";
import { getDb } from "@/db/client";

const sessionCookie = vi.hoisted(() => ({ value: "" }));
const blobStore = vi.hoisted(() => new Map<string, Buffer>());
const revalidatePath = vi.hoisted(() => vi.fn());
const revalidateTag = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: async () => {
    const headers = new Headers();
    if (sessionCookie.value) {
      headers.set("cookie", sessionCookie.value);
    }
    return headers;
  },
}));

vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: () => Promise<unknown>) =>
    () =>
      fn(),
  revalidatePath,
  revalidateTag,
}));

vi.mock("@vercel/blob", () => ({
  put: async (
    pathname: string,
    body: ArrayBuffer | Buffer | Blob,
    _options: Record<string, unknown>,
  ) => {
    const bytes = new Uint8Array(
      body instanceof Blob
        ? await body.arrayBuffer()
        : body instanceof Buffer
          ? body
          : body,
    );
    blobStore.set(pathname, Buffer.from(bytes));
    return {
      pathname,
      url: `https://blob.test/${pathname}`,
    };
  },
  del: async () => {},
}));

const hasDatabase = Boolean(process.env.DATABASE_URL);
const hasAuthSecret = Boolean(process.env.BETTER_AUTH_SECRET);
const origin = "http://localhost:3000";

function pngFile(name = "photo.png"): File {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  return new File([bytes], name, { type: "image/png" });
}

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
        tagline: "Original tagline",
        location: "Koramangala",
        phone: "+919876543210",
      }),
    }),
  );
  expect(response.status).toBe(200);
}

async function uploadImage(cookie: string, purpose: "upi-qr", file: File) {
  const form = new FormData();
  form.set("purpose", purpose);
  form.set("file", file);

  const response = await uploadAsset(
    new Request(`${origin}/api/academy-assets/upload`, {
      method: "POST",
      headers: { origin, cookie },
      body: form,
    }),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { storageKey: string; url: string };
}

async function enableIntake(slug: string) {
  const db = getDb();
  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .where(eq(academies.slug, slug))
    .limit(1);
  expect(academy).toBeTruthy();

  const [batch] = await db
    .select({ id: batches.id })
    .from(batches)
    .where(eq(batches.academyId, academy!.id))
    .limit(1);
  expect(batch).toBeTruthy();

  await db
    .update(batches)
    .set({ isOpenForRegistration: true })
    .where(eq(batches.id, batch!.id));
  await db.insert(batchFeeOptions).values({
    academyId: academy!.id,
    batchId: batch!.id,
    daysPerWeek: 2,
    termMonths: 3,
    feePaise: 1500000,
    sortOrder: 0,
  });
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
        .delete(brochureImages)
        .where(eq(brochureImages.academyId, academy.id));
      await db
        .delete(youtubeEmbeds)
        .where(eq(youtubeEmbeds.academyId, academy.id));
      await db
        .delete(coachProfiles)
        .where(eq(coachProfiles.academyId, academy.id));
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
  "public Academy cache invalidation at the App Router seam",
  () => {
    const testEmail = `cache-owner-${Date.now()}@example.com`;
    const slug = `cache-${Date.now()}`;

    beforeEach(() => {
      enableMailCapture();
      sessionCookie.value = "";
      blobStore.clear();
      revalidatePath.mockClear();
      revalidateTag.mockClear();
    });

    afterEach(async () => {
      disableMailCapture();
      clearCapturedMail();
      sessionCookie.value = "";
      blobStore.clear();
      await deleteOwnerByEmail(testEmail);
    });

    it("purges public pages when the Owner saves the brochure", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      const saveResponse = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy",
            tagline: "Updated after save",
          }),
        }),
      );
      expect(saveResponse.status).toBe(200);

      expect(revalidateTag).toHaveBeenCalledWith(`public-academy-${slug}`, "max");
      expect(revalidatePath).toHaveBeenCalledWith(`/a/${slug}`);
      expect(revalidatePath).toHaveBeenCalledWith(`/a/${slug}/join`);

      const html = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );

      expect(html).toContain("Updated after save");
      expect(html).not.toContain("Original tagline");
    });

    it("purges public pages when the Owner saves conversion UPI QR", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);
      await enableIntake(slug);

      const upiQr = await uploadImage(cookie, "upi-qr", pngFile("upi.png"));

      const saveResponse = await saveConversion(
        new Request(`${origin}/api/conversion`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({ upiQrStorageKey: upiQr.storageKey }),
        }),
      );
      expect(saveResponse.status).toBe(200);

      expect(revalidateTag).toHaveBeenCalledWith(`public-academy-${slug}`, "max");
      expect(revalidatePath).toHaveBeenCalledWith(`/a/${slug}`);
      expect(revalidatePath).toHaveBeenCalledWith(`/a/${slug}/join`);

      const html = renderToStaticMarkup(
        await ConversionPage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );

      expect(html).toContain(encodeURIComponent(upiQr.storageKey));
      expect(html).toContain("Pay with UPI");
    });
  },
);
