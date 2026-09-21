import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as verifyAuth, POST as authPost } from "../auth/[...all]/route";
import { POST as completeOnboarding } from "../onboarding/route";
import { POST as saveBrochure } from "./route";
import AcademyBrochurePage, {
  generateMetadata as generateBrochureMetadata,
} from "@/app/a/[academySlug]/page";
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
  "brochure editor at the App Router seam",
  () => {
    const testEmail = `brochure-owner-${Date.now()}@example.com`;
    const slug = `brochure-${Date.now()}`;

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

    it("shows edited Academy fields on GET /a/{slug}", async () => {
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
            name: "Blitz Nets Academy",
            tagline: "Evening nets in the city",
            location: "Indiranagar",
            phone: "+919123456789",
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

      expect(html).toContain("Blitz Nets Academy");
      expect(html).toContain("Evening nets in the city");
      expect(html).toContain("Indiranagar");
      expect(html).toContain("+919123456789");
      expect(html).not.toContain("Blitz Cricket Academy");
      expect(html).not.toContain("Koramangala");
    });

    it("shows the canonical Phone and tel: link after saving a 10-digit Indian mobile", async () => {
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
            phone: "9876543210",
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

      expect(html).toContain("+919876543210");
      expect(html).toContain('href="tel:+919876543210"');
      expect(html).not.toContain(">9876543210<");
    });

    it("shows a location URL as a link and a place name as text", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);
      const mapsUrl = "https://maps.google.com/?q=Indiranagar";

      const mapsSave = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy",
            location: mapsUrl,
          }),
        }),
      );
      expect(mapsSave.status).toBe(200);

      const mapsHtml = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );

      expect(mapsHtml).toContain(`href="${mapsUrl}"`);
      expect(mapsHtml).not.toContain("<iframe");

      const textSave = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy",
            location: "Koramangala",
          }),
        }),
      );
      expect(textSave.status).toBe(200);

      const textHtml = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );

      expect(textHtml).toContain("Koramangala");
      expect(textHtml).not.toContain("<iframe");
    });

    it("uses a Contact CTA that names the stored phone when intake is unavailable", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      const html = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );

      expect(html).toContain("Call to Register");
      expect(html).toContain("+919876543210");
      expect(html).not.toContain(`href="/a/${slug}/join"`);
    });

    it("links Register to the conversion page when intake is available", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

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

      const html = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );

      expect(html).toContain("Register");
      expect(html).toContain(`/a/${slug}/join`);
      expect(html).toContain("+919876543210");
      expect(html).not.toContain("Contact +919876543210");
    });

    it("omits the CTA when intake is unavailable and phone is missing", async () => {
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
            phone: "",
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

      expect(html).not.toContain("Contact");
      expect(html).not.toContain("Register");
      expect(html).not.toContain(`/a/${slug}/join`);
    });

    it("includes the brochure CTA in the Owner preview", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      sessionCookie.value = cookie;
      const { default: BrochureEditorPage } = await import(
        "@/app/app/brochure/page"
      );
      const html = renderToStaticMarkup(await BrochureEditorPage());

      expect(html).toContain("Call to Register");
      expect(html).toContain(
        "A place name or a map link.",
      );
    });

    it("shows edited Batch blurbs, YouTube, and Coach profiles on GET /a/{slug}", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      sessionCookie.value = cookie;
      const { default: BrochureEditorPage } = await import(
        "@/app/app/brochure/page"
      );
      const editorHtml = renderToStaticMarkup(await BrochureEditorPage());
      const batchId = editorHtml.match(/data-batch-id="([^"]+)"/)?.[1];
      expect(batchId).toBeTruthy();

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
            youtubeUrls: ["https://www.youtube.com/watch?v=jNQXAC9IVRw"],
            batchBlurbs: [
              { id: batchId, blurb: "U-14 evening batting and bowling" },
            ],
            coaches: [
              {
                fullName: "Ravi Kumar",
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

      expect(html).toContain("U-14 evening");
      expect(html).toContain("U-14 evening batting and bowling");
      expect(html).toContain(
        encodeURIComponent("img.youtube.com/vi/jNQXAC9IVRw/hqdefault.jpg"),
      );
      expect(html).toContain("Play YouTube video");
      expect(html).not.toContain("https://www.youtube.com/embed/jNQXAC9IVRw");
      expect(html).not.toContain("<iframe");
      expect(html).toContain("Ravi Kumar");
      expect(html).toContain("Head Coach");
    });

    it("uses Academy name, tagline, and brochure URL as indexable metadata", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      const metadata = await generateBrochureMetadata({
        params: Promise.resolve({ academySlug: slug }),
        searchParams: Promise.resolve({}),
      });

      expect(metadata.title).toBe("Blitz Cricket Academy");
      expect(metadata.description).toBe("Nets that make match-day simple");
      expect(metadata.alternates?.canonical).toBe(`${origin}/a/${slug}`);
    });

    it("lists only active Academy brochure URLs in the sitemap", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      const sitemap = (await import("@/app/sitemap")).default;
      const entries = await sitemap();
      const urls = entries.map((entry) => entry.url);

      expect(urls).toContain(`${origin}/a/${slug}`);

      const db = getDb();
      await db
        .update(academies)
        .set({ isActive: false })
        .where(eq(academies.slug, slug));

      const afterDeactivate = await sitemap();
      expect(afterDeactivate.map((entry) => entry.url)).not.toContain(
        `${origin}/a/${slug}`,
      );
    });

    it("allows /a/ and disallows /app/ so /app/dashboard is not indexed", async () => {
      const robots = (await import("@/app/robots")).default;
      const result = robots();
      const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
      const star = rules.find((rule) => rule.userAgent === "*") ?? rules[0];

      expect(star.allow).toEqual("/a/");
      expect(star.disallow).toEqual("/app/");
    });

    it("marks the conversion page noindex", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      const { generateMetadata: generateJoinMetadata } = await import(
        "@/app/a/[academySlug]/join/page"
      );
      const metadata = await generateJoinMetadata({
        params: Promise.resolve({ academySlug: slug }),
        searchParams: Promise.resolve({}),
      });

      expect(metadata.robots).toEqual({ index: false, follow: false });
    });
  },
);
