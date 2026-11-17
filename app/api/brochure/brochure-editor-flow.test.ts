import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as verifyAuth, POST as authPost } from "../auth/[...all]/route";
import { POST as completeOnboarding } from "../onboarding/route";
import { POST as saveBrochure } from "./route";
import AcademyBrochurePage, {
  generateMetadata as generateBrochureMetadata,
} from "@/app/a/[academySlug]/page";
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
  impersonationAuditEvents,
  youtubeEmbeds,
} from "@/db/domain-schema";
import { user } from "@/db/auth-schema";
import { getDb } from "@/db/client";
import { getBrochureEditor } from "@/lib/brochure";
import { WHATSAPP_CHAT_MESSAGE_TEMPLATE } from "@/lib/constants";

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
        .delete(impersonationAuditEvents)
        .where(eq(impersonationAuditEvents.academyId, academy.id));
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
    const suffix = Date.now();
    const testEmail = `brochure-owner-${suffix}@example.com`;
    const superAdminEmail = `brochure-super-${suffix}@example.com`;
    const slug = `brochure-${suffix}`;

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
      await deleteOwnerByEmail(superAdminEmail);
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

      expect(html).toContain("Contact Us");
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
        termDays: 3,
        feePaise: 1500000,
        sortOrder: 0,
      });
      const [closedBatch] = await db
        .insert(batches)
        .values({
          academyId: academy!.id,
          name: "U-16 morning",
          isOpenForRegistration: false,
        })
        .returning({ id: batches.id });

      const html = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );

      expect(html).toContain("Register Now");
      expect(html).toContain(`/a/${slug}/join`);
      expect(html).toContain("+919876543210");
      expect(html).not.toContain("Contact +919876543210");

      const batchesSection =
        html.match(/<section[^>]*id="batches"[\s\S]*?<\/section>/)?.[0] ?? "";
      const cards = batchesSection.match(/<article[\s\S]*?<\/article>/g) ?? [];
      expect(cards).toHaveLength(2);
      expect(cards[0]).toContain("Open for Registration");
      expect(cards[0]).toContain("badge-success");
      expect(cards[0]).toContain(`href="/a/${slug}/join?batch=${batch!.id}"`);
      expect(cards[1]).toContain("Registration closed");
      expect(cards[1]).toContain("badge-error");
      expect(cards[1]).not.toContain(`href="/a/${slug}/join?batch=${closedBatch!.id}"`);
      expect(cards[1]).not.toContain(">Register<");
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

      expect(html).toContain("Contact Us");
      expect(html).toContain(
        "A place name or a map link.",
      );
      expect(html).toContain("Registration closed");
      expect(html).toContain("badge-error");

      const db = getDb();
      const [academy] = await db
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.slug, slug))
        .limit(1);
      const [batch] = await db
        .select({ id: batches.id })
        .from(batches)
        .where(eq(batches.academyId, academy!.id))
        .limit(1);
      await db
        .update(batches)
        .set({ isOpenForRegistration: true })
        .where(eq(batches.id, batch!.id));
      await db.insert(batchFeeOptions).values({
        academyId: academy!.id,
        batchId: batch!.id,
        daysPerWeek: 3,
        termDays: 30,
        feePaise: 1500000,
        sortOrder: 0,
      });

      const openPreviewHtml = renderToStaticMarkup(await BrochureEditorPage());
      expect(openPreviewHtml).toContain("Open for Registration");
      expect(openPreviewHtml).toContain("badge-success");
      expect(openPreviewHtml).toContain(
        `href="/a/${slug}/join?batch=${batch!.id}"`,
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

    it("saves about, aboutLabel (with blank reset), themeMode, and themeAccent onto /a/{slug} and /a/{slug}/join", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      const customSave = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy",
            tagline: "Match-day clarity",
            aboutLabel: "  Our Philosophy  ",
            about: "  Coach-led nets.\nSmall batches.  ",
            themeMode: "light",
            themeAccent: "emerald",
          }),
        }),
      );
      expect(customSave.status).toBe(200);

      const brochureHtml = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(brochureHtml).toContain('data-theme="light"');
      expect(brochureHtml).toContain("--color-primary:#10b981");
      expect(brochureHtml).toContain('id="about"');
      expect(brochureHtml).toContain(">Our Philosophy<");
      expect(brochureHtml).toContain("Coach-led nets.\nSmall batches.");
      expect(brochureHtml).toContain("/logo-black.svg");

      const joinHtml = renderToStaticMarkup(
        await ConversionPage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(joinHtml).toContain('data-theme="light"');
      expect(joinHtml).toContain("--color-primary:#10b981");
      expect(joinHtml).toContain(`href="/a/${slug}"`);
      expect(joinHtml).toContain("/logo-black.svg");

      const resetLabelSave = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy",
            aboutLabel: "   ",
            about: "Still has copy",
          }),
        }),
      );
      expect(resetLabelSave.status).toBe(200);

      const afterResetHtml = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(afterResetHtml).toContain(">About Us<");
      expect(afterResetHtml).toContain('data-theme="light"');
      expect(afterResetHtml).toContain("--color-primary:#10b981");
    });

    it("rejects invalid themeMode and themeAccent values with 400 invalid-input", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      for (const payload of [
        { name: "Blitz Cricket Academy", themeMode: "sepia" },
        { name: "Blitz Cricket Academy", themeMode: "" },
        { name: "Blitz Cricket Academy", themeMode: null },
        { name: "Blitz Cricket Academy", themeAccent: "pink" },
        { name: "Blitz Cricket Academy", themeAccent: "" },
        { name: "Blitz Cricket Academy", themeAccent: null },
        { name: "Blitz Cricket Academy", about: 123 },
        { name: "Blitz Cricket Academy", aboutLabel: {} },
        { name: "Blitz Cricket Academy", logoStorageKey: 42 },
      ]) {
        const response = await saveBrochure(
          new Request(`${origin}/api/brochure`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin,
              cookie,
            },
            body: JSON.stringify(payload),
          }),
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "invalid-input" });
      }
    });

    it("preserves omitted about, aboutLabel, logoStorageKey, themeMode, and themeAccent on partial updates", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      const db = getDb();
      const [academy] = await db
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.slug, slug))
        .limit(1);
      expect(academy).toBeTruthy();
      const logoKey = `academies/${academy!.id}/academy-logo/existing.png`;

      const initialSave = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy",
            aboutLabel: "Academy Story",
            about: "Established 2015",
            logoStorageKey: logoKey,
            themeMode: "light",
            themeAccent: "violet",
          }),
        }),
      );
      expect(initialSave.status).toBe(200);

      const partialSave = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy Updated",
            tagline: "Updated tagline only",
          }),
        }),
      );
      expect(partialSave.status).toBe(200);

      const [updated] = await db
        .select({
          name: academies.name,
          aboutLabel: academies.aboutLabel,
          about: academies.about,
          logoStorageKey: academies.logoStorageKey,
          themeMode: academies.themeMode,
          themeAccent: academies.themeAccent,
        })
        .from(academies)
        .where(eq(academies.id, academy!.id))
        .limit(1);

      expect(updated).toEqual({
        name: "Blitz Cricket Academy Updated",
        aboutLabel: "Academy Story",
        about: "Established 2015",
        logoStorageKey: logoKey,
        themeMode: "light",
        themeAccent: "violet",
      });
    });

    it("falls back generateMetadata description from tagline to about to undefined", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      const aboutFallbackSave = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy",
            tagline: "",
            about: "About copy becomes meta description",
          }),
        }),
      );
      expect(aboutFallbackSave.status).toBe(200);

      const withAbout = await generateBrochureMetadata({
        params: Promise.resolve({ academySlug: slug }),
        searchParams: Promise.resolve({}),
      });
      expect(withAbout.description).toBe("About copy becomes meta description");

      const emptyBothSave = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy",
            tagline: "",
            about: "",
          }),
        }),
      );
      expect(emptyBothSave.status).toBe(200);

      const withNeither = await generateBrochureMetadata({
        params: Promise.resolve({ academySlug: slug }),
        searchParams: Promise.resolve({}),
      });
      expect(withNeither.description).toBeUndefined();
    });

    it("saves canonical instagram and whatsapp, hydrates editor reload, renders Brochure only, and keeps Phone fallback separate", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      for (const igInput of [
        "Elite_Cricket",
        "@Elite_Cricket",
        "https://www.instagram.com/Elite_Cricket?igsh=123",
      ]) {
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
              instagram: igInput,
              whatsapp: "9876543210",
            }),
          }),
        );
        expect(saveResponse.status).toBe(200);
      }

      const db = getDb();
      const [academy] = await db
        .select({
          id: academies.id,
          instagramHandle: academies.instagramHandle,
          whatsapp: academies.whatsapp,
          phone: academies.phone,
        })
        .from(academies)
        .where(eq(academies.slug, slug))
        .limit(1);
      expect(academy).toMatchObject({
        instagramHandle: "Elite_Cricket",
        whatsapp: "+919876543210",
        phone: null,
      });

      const editorState = await getBrochureEditor(academy!.id);
      expect(editorState?.instagramUrl).toBe(
        "https://www.instagram.com/Elite_Cricket",
      );
      expect(editorState?.whatsapp).toBe("+919876543210");

      sessionCookie.value = cookie;
      const { default: BrochureEditorPage } = await import(
        "@/app/app/brochure/page"
      );
      const editorHtml = renderToStaticMarkup(await BrochureEditorPage());
      expect(editorHtml).toContain(
        'value="https://www.instagram.com/Elite_Cricket"',
      );
      expect(editorHtml).toContain('value="+919876543210"');
      expect(editorHtml).toContain("absolute right-6 bottom-6 z-30");

      const expectedWaMessage = WHATSAPP_CHAT_MESSAGE_TEMPLATE.replace(
        "{academy_name}",
        "Blitz Cricket Academy",
      );
      const expectedWaHref = `https://wa.me/919876543210?text=${encodeURIComponent(expectedWaMessage)}`;

      const brochureHtml = renderToStaticMarkup(
        await AcademyBrochurePage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(brochureHtml).toContain("Follow us on Instagram");
      expect(brochureHtml).toContain(
        'href="https://www.instagram.com/Elite_Cricket"',
      );
      expect(brochureHtml).toContain("Chat with us");
      expect(brochureHtml).toContain(`href="${expectedWaHref}"`);
      expect(brochureHtml).toContain("fixed right-6 bottom-6 z-30");
      expect(brochureHtml).not.toContain("Contact Us");
      expect(brochureHtml).not.toContain("Contact:");

      await db
        .update(academies)
        .set({ isOnlineRegistrationAllowed: false })
        .where(eq(academies.id, academy!.id));

      const joinHtml = renderToStaticMarkup(
        await ConversionPage({
          params: Promise.resolve({ academySlug: slug }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(joinHtml).toContain("Online Registration is off.");
      expect(joinHtml).not.toContain("Follow us on Instagram");
      expect(joinHtml).not.toContain("Chat with us");
      expect(joinHtml).not.toContain("https://wa.me/");
      expect(joinHtml).not.toContain("tel:");
    });

    it("clears instagram and whatsapp when empty and preserves them when omitted from partial updates", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      const initialSave = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy",
            instagram: "@Elite_Cricket",
            whatsapp: "9876543210",
          }),
        }),
      );
      expect(initialSave.status).toBe(200);

      const partialSave = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy Updated",
            tagline: "Only tagline changed",
          }),
        }),
      );
      expect(partialSave.status).toBe(200);

      const db = getDb();
      const [afterPartial] = await db
        .select({
          instagramHandle: academies.instagramHandle,
          whatsapp: academies.whatsapp,
        })
        .from(academies)
        .where(eq(academies.slug, slug))
        .limit(1);
      expect(afterPartial).toEqual({
        instagramHandle: "Elite_Cricket",
        whatsapp: "+919876543210",
      });

      const clearSave = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy Updated",
            instagram: "",
            whatsapp: "",
          }),
        }),
      );
      expect(clearSave.status).toBe(200);

      const [afterClear] = await db
        .select({
          instagramHandle: academies.instagramHandle,
          whatsapp: academies.whatsapp,
        })
        .from(academies)
        .where(eq(academies.slug, slug))
        .limit(1);
      expect(afterClear).toEqual({
        instagramHandle: null,
        whatsapp: null,
      });
    });

    it("rejects invalid instagram and whatsapp values with 400", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug);

      for (const badInstagram of [
        "https://www.instagram.com/p/ABC123/",
        "https://www.instagram.com/reel/ABC123/",
        "https://example.com/elite_cricket",
        "elite-cricket",
      ]) {
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
              instagram: badInstagram,
            }),
          }),
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "invalid-instagram" });
      }

      for (const badWhatsapp of [
        "123",
        "98abc43210",
        "+919876543210 ext 2",
      ]) {
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
              whatsapp: badWhatsapp,
            }),
          }),
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "invalid-phone" });
      }

      for (const nonStringPayload of [
        { name: "Blitz Cricket Academy", instagram: 123 },
        { name: "Blitz Cricket Academy", whatsapp: true },
      ]) {
        const response = await saveBrochure(
          new Request(`${origin}/api/brochure`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin,
              cookie,
            },
            body: JSON.stringify(nonStringPayload),
          }),
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "invalid-input" });
      }
    });

    it("records brochure.update in impersonation_audit_events when an impersonating Super-admin updates Instagram and WhatsApp", async () => {
      const ownerCookie = await signInOwner(testEmail);
      await onboardOwner(ownerCookie, slug);

      const superCookie = await signInOwner(superAdminEmail);
      const db = getDb();
      await db
        .update(user)
        .set({ isSuperAdmin: true, emailVerified: true })
        .where(eq(user.email, superAdminEmail));

      const [academy] = await db
        .select({ id: academies.id, ownerUserId: academies.ownerUserId })
        .from(academies)
        .where(eq(academies.slug, slug))
        .limit(1);
      expect(academy).toBeTruthy();

      const { POST: startImpersonation } = await import(
        "@/app/api/admin/academies/[academyId]/impersonate/route"
      );
      sessionCookie.value = superCookie;
      const impersonateResponse = await startImpersonation(
        new Request(`${origin}/api/admin/academies/${academy!.id}/impersonate`, {
          method: "POST",
          headers: { origin, cookie: superCookie },
        }),
        { params: Promise.resolve({ academyId: academy!.id }) },
      );
      expect(impersonateResponse.status).toBe(200);

      const saveResponse = await saveBrochure(
        new Request(`${origin}/api/brochure`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: superCookie,
          },
          body: JSON.stringify({
            name: "Blitz Cricket Academy",
            instagram: "https://www.instagram.com/Super_Edited",
            whatsapp: "9123456789",
          }),
        }),
      );
      expect(saveResponse.status).toBe(200);

      const audits = await db
        .select()
        .from(impersonationAuditEvents)
        .where(eq(impersonationAuditEvents.academyId, academy!.id));
      expect(audits).toHaveLength(1);
      expect(audits[0]?.action).toBe("brochure.update");
      expect(audits[0]?.subjectUserId).toBe(academy!.ownerUserId);

      const [updated] = await db
        .select({
          instagramHandle: academies.instagramHandle,
          whatsapp: academies.whatsapp,
        })
        .from(academies)
        .where(eq(academies.id, academy!.id))
        .limit(1);
      expect(updated).toEqual({
        instagramHandle: "Super_Edited",
        whatsapp: "+919123456789",
      });
    });
  },
);
