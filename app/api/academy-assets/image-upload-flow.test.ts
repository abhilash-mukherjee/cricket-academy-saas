import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as verifyAuth, POST as authPost } from "../auth/[...all]/route";
import { POST as completeOnboarding } from "../onboarding/route";
import { POST as uploadAsset } from "./upload/route";
import { POST as saveBrochure } from "../brochure/route";
import { POST as saveConversion } from "../conversion/route";
import AcademyBrochurePage from "@/app/a/[academySlug]/page";
import ConversionPage from "@/app/a/[academySlug]/join/page";
import { getPublicConversion } from "@/lib/public-conversion";
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

vi.mock("next/headers", () => ({
  headers: async () => {
    const headers = new Headers();
    if (sessionCookie.value) {
      headers.set("cookie", sessionCookie.value);
    }
    return headers;
  },
}));

vi.mock("@vercel/blob", () => ({
  put: async (pathname: string, body: ArrayBuffer | Buffer | Blob) => {
    const bytes = new Uint8Array(
      body instanceof Blob
        ? await body.arrayBuffer()
        : body instanceof Buffer
          ? body
          : body,
    );
    const buffer = Buffer.from(bytes);
    blobStore.set(pathname, buffer);
    return {
      pathname,
      url: `https://blob.test/${pathname}`,
    };
  },
  del: async (pathnameOrUrl: string | string[]) => {
    const targets = Array.isArray(pathnameOrUrl)
      ? pathnameOrUrl
      : [pathnameOrUrl];
    for (const target of targets) {
      const pathname = target.replace(/^https:\/\/blob\.test\//, "");
      blobStore.delete(pathname);
    }
  },
}));

const hasDatabase = Boolean(process.env.DATABASE_URL);
const hasAuthSecret = Boolean(process.env.BETTER_AUTH_SECRET);
const origin = "http://localhost:3000";

function expectOptimizedAsset(html: string, storageKey: string) {
  expect(html).toContain(encodeURIComponent(storageKey));
}

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
        tagline: "Nets that make match-day simple",
        location: "Koramangala",
        phone: "+919876543210",
      }),
    }),
  );
  expect(response.status).toBe(200);
}

async function uploadImage(
  cookie: string,
  purpose: "academy-logo" | "brochure-gallery" | "coach-photo" | "upi-qr",
  file: File,
  draftGalleryCount?: number,
) {
  const form = new FormData();
  form.set("purpose", purpose);
  form.set("file", file);
  if (purpose === "brochure-gallery" && draftGalleryCount !== undefined) {
    form.set("draftGalleryCount", String(draftGalleryCount));
  }

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
  "Academy image upload at the App Router seam",
  () => {
    const testEmail = `image-owner-${Date.now()}@example.com`;
    const slug = `image-upload-${Date.now()}`;

    beforeEach(() => {
      enableMailCapture();
      sessionCookie.value = "";
      blobStore.clear();
      vi.mocked(revalidatePath).mockClear();
      vi.mocked(revalidateTag).mockClear();
    });

    afterEach(async () => {
      disableMailCapture();
      clearCapturedMail();
      sessionCookie.value = "";
      blobStore.clear();
      await deleteOwnerByEmail(testEmail);
    });

    it("shows uploaded brochure and Coach images on GET /a/{slug}", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      sessionCookie.value = cookie;
      const { default: BrochureEditorPage } = await import(
        "@/app/app/brochure/page"
      );
      const editorHtml = renderToStaticMarkup(await BrochureEditorPage());
      const batchId = editorHtml.match(/data-batch-id="([^"]+)"/)?.[1];
      expect(batchId).toBeTruthy();

      const gallery = await uploadImage(cookie, "brochure-gallery", pngFile(), 0);
      const coachPhoto = await uploadImage(cookie, "coach-photo", pngFile());

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
            tagline: "Nets that make match-day simple",
            location: "Koramangala",
            phone: "+919876543210",
            imageStorageKeys: [gallery.storageKey],
            youtubeUrls: ["https://www.youtube.com/watch?v=jNQXAC9IVRw"],
            batchBlurbs: [
              { id: batchId, blurb: "U-14 evening batting and bowling" },
            ],
            coaches: [
              {
                fullName: "Ravi Kumar",
                imageStorageKey: coachPhoto.storageKey,
                blurb: "Head Coach",
              },
            ],
          }),
        }),
      );
      expect(saveResponse.status).toBe(200);

      const html = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );

      expectOptimizedAsset(html, gallery.storageKey);
      expectOptimizedAsset(html, coachPhoto.storageKey);
      expect(html).toContain("Ravi Kumar");
      expect(html).toContain("Head Coach");
      expect(html).toContain("min-h-dvh");
      expect(html).toContain("object-cover");
      expect(html).not.toContain('data-carousel="hero"');
      expect(html).not.toContain("Previous");
    });

    it("allows another gallery upload after three images are already saved", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      const keys: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        const uploaded = await uploadImage(
          cookie,
          "brochure-gallery",
          pngFile(`gallery-${index}.png`),
          index,
        );
        keys.push(uploaded.storageKey);
      }

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
            imageStorageKeys: keys,
          }),
        }),
      );
      expect(saveResponse.status).toBe(200);

      const fourth = await uploadImage(
        cookie,
        "brochure-gallery",
        pngFile("gallery-3.png"),
        3,
      );
      expect(fourth.storageKey).toBeTruthy();
    });

    it("shows ambient hero carousel without arrows or dot controls when the gallery has two photos", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      const first = await uploadImage(cookie, "brochure-gallery", pngFile("one.png"), 0);
      const second = await uploadImage(
        cookie,
        "brochure-gallery",
        pngFile("two.png"),
        1,
      );

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
            imageStorageKeys: [first.storageKey, second.storageKey],
          }),
        }),
      );
      expect(saveResponse.status).toBe(200);

      const html = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );

      expectOptimizedAsset(html, first.storageKey);
      expectOptimizedAsset(html, second.storageKey);
      expect(html).toContain('data-carousel="hero"');
      expect(html).not.toContain("Previous");
      expect(html).not.toContain("Next");
      expect(html).not.toContain("Photo 1");
    });

    it("shows uploaded UPI QR on GET /a/{slug}/join when intake is available", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

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
        termDays: 3,
        feePaise: 1500000,
        sortOrder: 0,
      });

      const html = renderToStaticMarkup(
        await ConversionPage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );

      const conversion = await getPublicConversion(slug);
      expect(conversion?.upiQrUrl).toContain(upiQr.storageKey);
      expect(html).toContain("Register for a Batch.");
      expect(html).not.toContain("Pay with UPI");
    });

    it("uploads, replaces, and removes academy-logo across /a/{slug} and /a/{slug}/join and purges cache", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      const db = getDb();
      const [academy] = await db
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.slug, slug))
        .limit(1);
      expect(academy).toBeTruthy();

      const firstLogo = await uploadImage(cookie, "academy-logo", pngFile("logo1.png"));
      expect(firstLogo.storageKey).toMatch(
        new RegExp(`^academies/${academy!.id}/academy-logo/`),
      );
      expect(blobStore.has(firstLogo.storageKey)).toBe(true);

      vi.mocked(revalidatePath).mockClear();
      vi.mocked(revalidateTag).mockClear();

      const saveFirst = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy",
            logoStorageKey: firstLogo.storageKey,
          }),
        }),
      );
      expect(saveFirst.status).toBe(200);
      expect(revalidateTag).toHaveBeenCalledWith(`public-academy-${slug}`, "max");
      expect(revalidatePath).toHaveBeenCalledWith(`/a/${slug}`);
      expect(revalidatePath).toHaveBeenCalledWith(`/a/${slug}/join`);

      const brochureHtml = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      const brochureHeader =
        brochureHtml.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
      expectOptimizedAsset(brochureHeader, firstLogo.storageKey);
      expect(brochureHeader).not.toMatch(/<a[^>]*>[\s\S]*academy-logo[\s\S]*<\/a>/);

      // Intake closed state on /join
      const closedJoinHtml = renderToStaticMarkup(
        await ConversionPage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(closedJoinHtml).toContain("Intake is closed.");
      const closedHeader =
        closedJoinHtml.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
      expectOptimizedAsset(closedHeader, firstLogo.storageKey);
      expect(closedHeader).toMatch(
        new RegExp(`<a[^>]*href="/a/${slug}"[^>]*>[\\s\\S]*${encodeURIComponent(firstLogo.storageKey)}`),
      );

      // Active intake state on /join
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
        termDays: 30,
        feePaise: 1500000,
        sortOrder: 0,
      });

      const activeJoinHtml = renderToStaticMarkup(
        await ConversionPage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(activeJoinHtml).toContain("Register for a Batch.");
      expectOptimizedAsset(
        activeJoinHtml.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "",
        firstLogo.storageKey,
      );

      // Online registration off state on /join
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

      const offJoinHtml = renderToStaticMarkup(
        await ConversionPage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(offJoinHtml).toContain("Online Registration is off.");
      expectOptimizedAsset(
        offJoinHtml.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "",
        firstLogo.storageKey,
      );

      // Replace logo deletes old blob
      const secondLogo = await uploadImage(cookie, "academy-logo", pngFile("logo2.png"));
      const saveSecond = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy",
            logoStorageKey: secondLogo.storageKey,
          }),
        }),
      );
      expect(saveSecond.status).toBe(200);
      expect(blobStore.has(firstLogo.storageKey)).toBe(false);
      expect(blobStore.has(secondLogo.storageKey)).toBe(true);

      // Remove logo deletes blob and restores default restartHQ mark
      const removeLogo = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy",
            logoStorageKey: null,
          }),
        }),
      );
      expect(removeLogo.status).toBe(200);
      expect(blobStore.has(secondLogo.storageKey)).toBe(false);

      const afterRemoveBrochure = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(afterRemoveBrochure).toContain("/logo-white.svg");

      const afterRemoveJoin = renderToStaticMarkup(
        await ConversionPage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(afterRemoveJoin).toContain("/logo-white.svg");
    });

    it("rejects cross-academy logoStorageKey with 403 invalid-storage-key", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      const response = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy",
            logoStorageKey: "academies/other-academy/academy-logo/evil.png",
          }),
        }),
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "invalid-storage-key" });
    });
  },
);
