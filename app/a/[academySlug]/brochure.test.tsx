import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AcademyBrochurePage from "./page";
import AcademyNotFound from "./not-found";
import { BrochureView } from "./brochure-view";
import {
  HERO_CAROUSEL_INTERVAL_MS,
  startHeroCarouselTimer,
} from "./brochure-gallery";
import {
  emptyValues,
  RegistrationForm,
} from "./join/registration-form";
import { RegistrationThankYou } from "./join/registration-thank-you";
import { ConversionView } from "./join/page";
import {
  BrochureEditor,
  changeEditorPhone,
  changeEditorWhatsapp,
  initialPhoneSyncState,
  toggleWhatsappSameAsPhone,
} from "@/app/app/brochure/brochure-editor";
import { ACADEMY_THEME_ACCENTS } from "@/lib/academy-theme";
import {
  ACADEMY_NOT_FOUND,
  WHATSAPP_CHAT_MESSAGE_TEMPLATE,
} from "@/lib/constants";
import type { PublicBrochure } from "@/lib/public-brochure";
import type { PublicConversion } from "@/lib/public-conversion";
import { PUBLIC_PRIMARY_BUTTON_CLASS } from "./public-button";

function makeConversion(
  overrides: Partial<PublicConversion> = {},
): PublicConversion {
  return {
    name: "Blitz Cricket Academy",
    slug: "blitz-cricket",
    logoUrl: null,
    themeMode: "dark",
    themeAccent: "default",
    phone: "+919876543210",
    upiQrUrl: null,
    isOnlineRegistrationAllowed: true,
    isIntakeAvailable: true,
    batches: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Under-14",
        feeOptions: [
          {
            id: "fee-1",
            daysPerWeek: 3,
            termDays: 30,
            feePaise: 1500000,
            label: "Weekday nets",
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeBrochure(overrides: Partial<PublicBrochure> = {}): PublicBrochure {
  return {
    name: "Blitz Cricket Academy",
    slug: "blitz-cricket",
    tagline: "Match-day readiness",
    aboutLabel: "About Us",
    about: null,
    logoUrl: null,
    themeMode: "dark",
    themeAccent: "default",
    location: "Koramangala",
    phone: "+919876543210",
    instagramHandle: null,
    whatsapp: null,
    isIntakeAvailable: false,
    images: [],
    youtubeVideoIds: [],
    batches: [],
    coaches: [],
    ...overrides,
  };
}

const hasDatabase = Boolean(process.env.DATABASE_URL);

function isAcademyNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    error.digest === "NEXT_HTTP_ERROR_FALLBACK;404"
  );
}

describe.skipIf(!hasDatabase)("public Academy brochure at the App Router seam", () => {
  it("returns 404 Academy not found for an unknown slug", async () => {
    const academySlug = "no-such-academy";

    await expect(
      AcademyBrochurePage({
        params: Promise.resolve({ academySlug }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toSatisfy(isAcademyNotFound);

    expect(renderToStaticMarkup(<AcademyNotFound />)).toContain(
      ACADEMY_NOT_FOUND,
    );
  });
});

describe("Academy Brochure public seam", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders dark theme, sticky blurred header with non-clickable white logo, and conditional hamburger menu", () => {
    const html = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          isIntakeAvailable: true,
          batches: [
            {
              id: "batch-1",
              name: "U-14 evening",
              blurb: "Batting and fielding",
              isRegistrable: true,
            },
          ],
          coaches: [{ fullName: "Ravi Kumar", imageUrl: null, blurb: "Head Coach" }],
        })}
      />,
    );

    expect(html).toContain('data-theme="dark"');
    const header = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(header).toMatch(/\bsticky\b/);
    expect(header).toMatch(/\btop-0\b/);
    expect(header).toMatch(/\bbackdrop-blur/);
    expect(header).toContain("/logo-white.svg");
    expect(header).not.toMatch(/<a[^>]*>[\s\S]*logo-white\.svg[\s\S]*<\/a>/);
    expect(header).not.toContain("Open menu");

    const nav = header.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(nav).toContain("Register");
    expect(nav).toContain('href="/a/blitz-cricket/join"');
    expect(nav).toContain("Contact: +919876543210");
    expect(nav).toContain('href="tel:+919876543210"');
    expect(nav).toContain("Explore Batches");
    expect(nav).toContain('href="#batches"');
    expect(nav).toContain("Coaches");
    expect(nav).toContain('href="#coaches"');
  });

  it("omits unavailable menu items and hides the hamburger menu when all four options are absent", () => {
    const onlyPhone = renderToStaticMarkup(
      <BrochureView brochure={makeBrochure({ phone: "+919876543210" })} />,
    );
    const onlyPhoneNav = onlyPhone.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(onlyPhoneNav).toContain("Contact: +919876543210");
    expect(onlyPhoneNav).not.toContain("Register");
    expect(onlyPhoneNav).not.toContain("Explore Batches");
    expect(onlyPhoneNav).not.toContain("Coaches");

    const emptyMenu = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          isIntakeAvailable: false,
          phone: null,
          about: null,
          batches: [],
          coaches: [],
        })}
      />,
    );
    const header = emptyMenu.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(header).toContain("/logo-white.svg");
    expect(header).not.toContain("<details");
    expect(header).not.toContain("<nav");
  });

  it("renders #about first below the hero, falls back to About Us when heading is blank, and links it in the hamburger menu", () => {
    const html = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          isIntakeAvailable: true,
          aboutLabel: "Our Story",
          about: "Founded in 2012.\nAll-weather turf nets.",
          youtubeVideoIds: ["jNQXAC9IVRw"],
          batches: [
            {
              id: "batch-1",
              name: "U-14 evening",
              blurb: "Evening nets",
              isRegistrable: true,
            },
          ],
          coaches: [{ fullName: "Ravi Kumar", imageUrl: null, blurb: "Head Coach" }],
        })}
      />,
    );

    const header = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    const nav = header.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(nav).toContain('href="#about"');
    expect(nav).toContain("Our Story");

    const registerAt = nav.indexOf("Register");
    const contactAt = nav.indexOf("Contact:");
    const aboutNavAt = nav.indexOf("Our Story");
    const batchesNavAt = nav.indexOf("Explore Batches");
    const coachesNavAt = nav.indexOf("Coaches");
    expect(contactAt).toBeGreaterThan(registerAt);
    expect(aboutNavAt).toBeGreaterThan(contactAt);
    expect(batchesNavAt).toBeGreaterThan(aboutNavAt);
    expect(coachesNavAt).toBeGreaterThan(batchesNavAt);

    const heroEnd = html.indexOf("</section>");
    const aboutAt = html.indexOf('id="about"');
    const videosAt = html.indexOf('aria-label="Videos"');
    const batchesAt = html.indexOf('id="batches"');
    const coachesAt = html.indexOf('id="coaches"');
    expect(aboutAt).toBeGreaterThan(heroEnd);
    expect(videosAt).toBeGreaterThan(aboutAt);
    expect(batchesAt).toBeGreaterThan(videosAt);
    expect(coachesAt).toBeGreaterThan(batchesAt);
    expect(html).toContain(">Our Story<");
    expect(html).toContain("Founded in 2012.\nAll-weather turf nets.");

    const fallbackHtml = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          isIntakeAvailable: false,
          phone: null,
          aboutLabel: "   ",
          about: "Only about is present.",
        })}
      />,
    );
    const fallbackHeader =
      fallbackHtml.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(fallbackHeader).toContain("<details");
    expect(fallbackHeader).toContain('href="#about"');
    expect(fallbackHeader).toContain(">About Us<");
    expect(fallbackHtml).toContain('<h2 class="text-xl font-semibold">About Us</h2>');

    const omittedAboutHtml = renderToStaticMarkup(
      <BrochureView brochure={makeBrochure({ about: null })} />,
    );
    expect(omittedAboutHtml).not.toContain('id="about"');
    expect(omittedAboutHtml).not.toContain('href="#about"');
  });

  it("renders custom academy logo or theme-matched restartHQ fallback in BrochureView", () => {
    const customLogoHtml = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          logoUrl: "https://blob.test/academies/a/academy-logo/logo.png",
        })}
      />,
    );
    const customHeader =
      customLogoHtml.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(customHeader).toContain(
      encodeURIComponent("https://blob.test/academies/a/academy-logo/logo.png"),
    );
    expect(customHeader).toContain('alt="Blitz Cricket Academy logo"');
    expect(customHeader).toContain("max-h-10 w-auto object-contain");
    expect(customHeader).not.toContain("/logo-white.svg");
    expect(customHeader).not.toContain("/logo-black.svg");
    expect(customHeader).not.toMatch(/<a[^>]*>[\s\S]*academy-logo[\s\S]*<\/a>/);

    const lightDefaultHtml = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          logoUrl: null,
          themeMode: "light",
        })}
      />,
    );
    const lightHeader =
      lightDefaultHtml.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(lightHeader).toContain("/logo-black.svg");
    expect(lightHeader).not.toContain("/logo-white.svg");
    expect(lightHeader).not.toMatch(/<a[^>]*>[\s\S]*logo-black\.svg[\s\S]*<\/a>/);
  });

  it("applies light/dark theme mode, brand accent CSS vars, and hero scrim contrast classes", () => {
    const zeroImageLightHtml = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          themeMode: "light",
          themeAccent: "emerald",
          images: [],
        })}
      />,
    );
    expect(zeroImageLightHtml).toContain('data-theme="light"');
    expect(zeroImageLightHtml).toContain("--color-primary:#10b981");
    expect(zeroImageLightHtml).toContain("--color-primary-content:#022c22");
    const zeroHero =
      zeroImageLightHtml.match(
        /<section[^>]*aria-label="Academy hero"[\s\S]*?<\/section>/,
      )?.[0] ?? "";
    expect(zeroHero).not.toContain("bg-neutral/65");
    expect(zeroHero).toContain("text-base-content");
    expect(zeroHero).toContain("text-base-content/85");
    expect(zeroHero).toContain("text-base-content/90");
    expect(zeroHero).not.toContain("text-neutral-content");

    const imageLightHtml = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          themeMode: "light",
          themeAccent: "blue",
          images: [{ url: "https://blob.test/academies/a/brochure-gallery/1.png" }],
        })}
      />,
    );
    expect(imageLightHtml).toContain("--color-primary:#2563eb");
    expect(imageLightHtml).toContain("--color-primary-content:#ffffff");
    const imageHero =
      imageLightHtml.match(
        /<section[^>]*aria-label="Academy hero"[\s\S]*?<\/section>/,
      )?.[0] ?? "";
    expect(imageHero).toContain("bg-neutral/65");
    expect(imageHero).toContain("text-neutral-content");
    expect(imageHero).toContain("text-neutral-content/85");
    expect(imageHero).toContain("text-neutral-content/90");
  });

  it("renders a full-viewport hero with 0, 1, or 2+ gallery images without arrows or dot controls, and no bottom floating bar", () => {
    const zeroImagesHtml = renderToStaticMarkup(
      <BrochureView brochure={makeBrochure({ images: [] })} />,
    );
    expect(zeroImagesHtml).toMatch(/\bmin-h-dvh\b/);
    expect(zeroImagesHtml).not.toContain('data-carousel="hero"');
    expect(zeroImagesHtml).not.toContain("fixed inset-x-0 bottom-0");
    expect(zeroImagesHtml).not.toContain("btn-neutral");

    const oneImageHtml = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          images: [{ url: "https://blob.test/academies/a/brochure-gallery/1.png" }],
        })}
      />,
    );
    expect(oneImageHtml).toContain(
      encodeURIComponent("https://blob.test/academies/a/brochure-gallery/1.png"),
    );
    expect(oneImageHtml).not.toContain('data-carousel="hero"');
    expect(oneImageHtml).not.toContain("Previous");
    expect(oneImageHtml).not.toContain("Next");

    const multiImageHtml = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          images: [
            { url: "https://blob.test/academies/a/brochure-gallery/1.png" },
            { url: "https://blob.test/academies/a/brochure-gallery/2.png" },
          ],
        })}
      />,
    );
    expect(multiImageHtml).toContain('data-carousel="hero"');
    expect(multiImageHtml).toContain(
      encodeURIComponent("https://blob.test/academies/a/brochure-gallery/1.png"),
    );
    expect(multiImageHtml).toContain(
      encodeURIComponent("https://blob.test/academies/a/brochure-gallery/2.png"),
    );
    expect(multiImageHtml).not.toContain("Previous");
    expect(multiImageHtml).not.toContain("Next");
    expect(multiImageHtml).not.toContain("Photo 1");
  });

  it("auto-plays the hero carousel every 5 seconds and respects prefers-reduced-motion", () => {
    vi.useFakeTimers();
    const advance = vi.fn();

    expect(HERO_CAROUSEL_INTERVAL_MS).toBe(5000);

    const singleStop = startHeroCarouselTimer(1, advance, () => ({ matches: false }));
    vi.advanceTimersByTime(10_000);
    expect(advance).not.toHaveBeenCalled();
    singleStop();

    const reducedStop = startHeroCarouselTimer(2, advance, () => ({ matches: true }));
    vi.advanceTimersByTime(10_000);
    expect(advance).not.toHaveBeenCalled();
    reducedStop();

    const activeStop = startHeroCarouselTimer(3, advance, () => ({ matches: false }));
    vi.advanceTimersByTime(4999);
    expect(advance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(advance).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(advance).toHaveBeenCalledTimes(2);
    activeStop();
    vi.advanceTimersByTime(10_000);
    expect(advance).toHaveBeenCalledTimes(2);
  });

  it("overlays hero details and switches the hero CTA between Register Now, Contact Us, and omitted", () => {
    const openHtml = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          isIntakeAvailable: true,
          location: "https://maps.google.com/?q=Koramangala",
          phone: "+919876543210",
        })}
      />,
    );
    const openHero =
      openHtml.match(/<section[^>]*aria-label="Academy hero"[\s\S]*?<\/section>/)?.[0] ??
      "";
    expect(openHero).toContain("Blitz Cricket Academy");
    expect(openHero).toContain("Match-day readiness");
    expect(openHero).toContain('href="https://maps.google.com/?q=Koramangala"');
    expect(openHero).toContain('href="tel:+919876543210"');
    expect(openHero).toContain('href="/a/blitz-cricket/join"');
    expect(openHero).toContain("Register Now");
    expect(openHero).not.toContain("Contact Us");
    expect(openHero).not.toContain("btn-neutral");
    expect(openHero).toContain(PUBLIC_PRIMARY_BUTTON_CLASS);

    const callHtml = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          isIntakeAvailable: false,
          phone: "+919876543210",
        })}
      />,
    );
    const callHero =
      callHtml.match(/<section[^>]*aria-label="Academy hero"[\s\S]*?<\/section>/)?.[0] ??
      "";
    expect(callHero).toContain("Contact Us");
    expect(callHero).toContain('href="tel:+919876543210"');
    expect(callHero).not.toContain('href="/a/blitz-cricket/join"');
    expect(callHero).not.toContain("btn-neutral");

    const omittedHtml = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          isIntakeAvailable: false,
          phone: null,
        })}
      />,
    );
    const omittedHero =
      omittedHtml.match(/<section[^>]*aria-label="Academy hero"[\s\S]*?<\/section>/)?.[0] ??
      "";
    expect(omittedHero).not.toContain("Register");
    expect(omittedHero).not.toContain("Contact Us");
  });

  it("stacks Videos, Batches, and Coaches in a single column below the hero with anchor targets", () => {
    const html = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          youtubeVideoIds: ["jNQXAC9IVRw"],
          batches: [
            {
              id: "batch-1",
              name: "U-14 evening",
              blurb: "Evening nets",
              isRegistrable: true,
            },
          ],
          coaches: [
            {
              fullName: "Ravi Kumar",
              imageUrl: "https://blob.test/academies/a/coach-photos/ravi.png",
              blurb: "Head Coach",
            },
          ],
        })}
      />,
    );

    expect(html).not.toContain("lg:grid-cols-2");
    expect(html).toContain('aria-label="Videos"');
    expect(html).toContain('id="batches"');
    expect(html).toContain('id="coaches"');

    const heroEnd = html.indexOf("</section>");
    const videosIndex = html.indexOf('aria-label="Videos"');
    const batchesIndex = html.indexOf('id="batches"');
    const coachesIndex = html.indexOf('id="coaches"');
    expect(videosIndex).toBeGreaterThan(heroEnd);
    expect(batchesIndex).toBeGreaterThan(videosIndex);
    expect(coachesIndex).toBeGreaterThan(batchesIndex);
  });

  it("renders a minimal animated hero scroll nudge only when below-hero content exists, matching hero contrast", () => {
    const emptyBelowHeroHtml = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          about: null,
          youtubeVideoIds: [],
          batches: [],
          coaches: [],
        })}
      />,
    );
    expect(emptyBelowHeroHtml).not.toContain('aria-label="Scroll to content"');
    expect(emptyBelowHeroHtml).not.toContain("data-brochure-content");

    const plainHeroHtml = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          about: "Coach-led training.",
          images: [],
        })}
      />,
    );
    const plainHero =
      plainHeroHtml.match(/<section[^>]*aria-label="Academy hero"[\s\S]*?<\/section>/)?.[0] ??
      "";
    expect(plainHero).toMatch(/<button[^>]*type="button"[^>]*aria-label="Scroll to content"/);
    expect(plainHero).toContain("text-base-content/60");
    expect(plainHero).toContain("animate-[hero-nudge_2.2s_ease-in-out_infinite]");
    expect(plainHero).toContain("motion-reduce:animate-none");
    expect(plainHero).toContain('aria-hidden="true"');
    expect(plainHeroHtml).toContain('data-brochure-content=""');
    expect(plainHeroHtml).toContain("scroll-mt-16");

    const imageHeroHtml = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          batches: [
            {
              id: "batch-1",
              name: "U-14 evening",
              blurb: null,
              isRegistrable: false,
            },
          ],
          images: [{ url: "https://blob.test/academies/a/brochure-gallery/1.png" }],
        })}
      />,
    );
    const imageHero =
      imageHeroHtml.match(/<section[^>]*aria-label="Academy hero"[\s\S]*?<\/section>/)?.[0] ??
      "";
    expect(imageHero).toContain('aria-label="Scroll to content"');
    expect(imageHero).toContain("text-neutral-content/70");
    expect(imageHero).not.toContain("text-base-content/60");
  });

  it("renders Batch registration status badges and per-Batch Register CTAs on BrochureView", () => {
    const html = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          isIntakeAvailable: true,
          batches: [
            {
              id: "batch-open",
              name: "U-14 evening",
              blurb: "Evening nets",
              isRegistrable: true,
            },
            {
              id: "batch-closed",
              name: "U-16 morning",
              blurb: "Morning conditioning",
              isRegistrable: false,
            },
          ],
        })}
      />,
    );

    const batchesSection =
      html.match(/<section[^>]*id="batches"[\s\S]*?<\/section>/)?.[0] ?? "";
    const articles = batchesSection.match(/<article[\s\S]*?<\/article>/g) ?? [];
    expect(articles).toHaveLength(2);

    const [openCard, closedCard] = articles;
    expect(openCard).toContain("U-14 evening");
    expect(openCard).toContain("badge-success");
    expect(openCard).toContain("Open for Registration");
    expect(openCard).toContain('href="/a/blitz-cricket/join?batch=batch-open"');
    expect(openCard).toContain(PUBLIC_PRIMARY_BUTTON_CLASS);
    expect(openCard).toContain(">Register<");

    expect(closedCard).toContain("U-16 morning");
    expect(closedCard).toContain("badge-error");
    expect(closedCard).toContain("Registration closed");
    expect(closedCard).not.toContain("/join");
    expect(closedCard).not.toContain(">Register<");
  });

  it("renders Instagram in the hero metadata row when set, omits it when null, and never adds it to the hamburger menu", () => {
    const withAllMeta = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          location: "Koramangala",
          phone: "+919876543210",
          instagramHandle: "Elite_Cricket",
          isIntakeAvailable: true,
        })}
      />,
    );
    const header = withAllMeta.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(header).not.toContain("Follow us on Instagram");
    expect(header).not.toContain("instagram.com");

    const hero =
      withAllMeta.match(/<section[^>]*aria-label="Academy hero"[\s\S]*?<\/section>/)?.[0] ??
      "";
    expect(hero).toContain("Follow us on Instagram");
    expect(hero).toContain('href="https://www.instagram.com/Elite_Cricket"');
    expect(hero).toContain('target="_blank"');
    expect(hero).toContain('rel="noopener noreferrer"');

    const locationAt = hero.indexOf("Koramangala");
    const phoneAt = hero.indexOf("+919876543210");
    const igAt = hero.indexOf("Follow us on Instagram");
    expect(phoneAt).toBeGreaterThan(locationAt);
    expect(igAt).toBeGreaterThan(phoneAt);

    const onlyInstagram = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          location: null,
          phone: null,
          instagramHandle: "elite.cricket",
        })}
      />,
    );
    expect(onlyInstagram).toContain("Follow us on Instagram");
    expect(onlyInstagram).toContain('href="https://www.instagram.com/elite.cricket"');

    const withoutInstagram = renderToStaticMarkup(
      <BrochureView brochure={makeBrochure({ instagramHandle: null })} />,
    );
    expect(withoutInstagram).not.toContain("Follow us on Instagram");
    expect(withoutInstagram).not.toContain("instagram.com");
  });

  it("renders floating WhatsApp CTA in viewport or frame placement and keeps Phone vs WhatsApp strictly separate", () => {
    const expectedText = WHATSAPP_CHAT_MESSAGE_TEMPLATE.replace(
      "{academy_name}",
      "Blitz Cricket Academy",
    );
    const expectedHref = `https://wa.me/919876543210?text=${encodeURIComponent(expectedText)}`;

    const withWhatsapp = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          phone: null,
          isIntakeAvailable: false,
          whatsapp: "+919876543210",
        })}
      />,
    );
    expect(withWhatsapp).toMatch(/data-brochure-root=""[^>]*class="[^"]*\brelative\b/);
    expect(withWhatsapp).toContain("Chat with us");
    expect(withWhatsapp).toContain(`href="${expectedHref}"`);
    expect(withWhatsapp).toContain('target="_blank"');
    expect(withWhatsapp).toContain('rel="noopener noreferrer"');
    expect(withWhatsapp).toContain("fixed right-6 bottom-6 z-30");
    expect(withWhatsapp).toContain("bg-[#25D366]");
    expect(withWhatsapp).not.toContain("Contact Us");
    expect(withWhatsapp).not.toContain("Contact:");

    const inFrame = renderToStaticMarkup(
      <BrochureView
        floatingPlacement="frame"
        brochure={makeBrochure({
          whatsapp: "+919876543210",
        })}
      />,
    );
    expect(inFrame).toContain("absolute right-6 bottom-6 z-30");
    expect(inFrame).not.toContain("fixed right-6 bottom-6 z-30");

    const withoutWhatsapp = renderToStaticMarkup(
      <BrochureView brochure={makeBrochure({ whatsapp: null })} />,
    );
    expect(withoutWhatsapp).not.toContain("Chat with us");
    expect(withoutWhatsapp).not.toContain("https://wa.me/");
  });
});

describe("public Academy dark theme and primary buttons", () => {
  it("renders AcademyNotFound in the dark theme", () => {
    const html = renderToStaticMarkup(<AcademyNotFound />);

    expect(html).toContain('data-theme="dark"');
    expect(html).toContain(ACADEMY_NOT_FOUND);
  });

  it("renders Conversion form and thank-you buttons as light/white-grey buttons instead of btn-neutral", () => {
    const formHtml = renderToStaticMarkup(
      <RegistrationForm
        academySlug="blitz-cricket"
        batches={[
          {
            id: "batch-1",
            name: "U-14 evening",
            feeOptions: [
              {
                id: "fee-1",
                daysPerWeek: 3,
                termDays: 30,
                feePaise: 1500000,
                label: "Weekday nets",
              },
            ],
          },
        ]}
        upiQrUrl={null}
      />,
    );

    expect(formHtml).toContain("Submit Registration");
    expect(formHtml).not.toContain("btn-neutral");
    expect(formHtml).toContain(PUBLIC_PRIMARY_BUTTON_CLASS);
    expect(formHtml).toContain("radio radio-primary mt-1");
    expect(formHtml).toContain("border-2 border-transparent");
    expect(formHtml).not.toContain("border-2 border-primary");
    expect(formHtml).not.toContain("checked=\"\"");

    const preselectedFormHtml = renderToStaticMarkup(
      <RegistrationForm
        academySlug="blitz-cricket"
        initialBatchId="batch-1"
        batches={[
          {
            id: "batch-1",
            name: "U-14 evening",
            feeOptions: [
              {
                id: "fee-1",
                daysPerWeek: 3,
                termDays: 30,
                feePaise: 1500000,
                label: "Weekday nets",
              },
            ],
          },
        ]}
        upiQrUrl={null}
      />,
    );
    expect(preselectedFormHtml).toContain("border-2 border-primary");
    expect(preselectedFormHtml).toContain('value="fee-1"');
    expect(preselectedFormHtml).toContain("checked=\"\"");

    const multiOptionFormHtml = renderToStaticMarkup(
      <RegistrationForm
        academySlug="blitz-cricket"
        batches={[
          {
            id: "batch-1",
            name: "U-14 evening",
            feeOptions: [
              {
                id: "fee-1",
                daysPerWeek: 3,
                termDays: 30,
                feePaise: 1500000,
                label: "Weekday nets",
              },
              {
                id: "fee-2",
                daysPerWeek: 5,
                termDays: 30,
                feePaise: 2200000,
                label: "Full week",
              },
            ],
          },
        ]}
        upiQrUrl={null}
      />,
    );
    expect(multiOptionFormHtml).toContain("border-2 border-transparent");
    expect(multiOptionFormHtml).not.toContain("border-2 border-primary");

    const thankYouHtml = renderToStaticMarkup(
      <RegistrationThankYou
        snapshot={{
          batchName: "U-14 evening",
          daysPerWeek: 3,
          termDays: 30,
          feePaise: 1500000,
          contactPhone: "+919876543210",
          contactEmail: null,
          label: "Weekday nets",
        }}
        upiQrUrl={null}
        onRegisterAnother={() => undefined}
      />,
    );

    expect(thankYouHtml).toContain("Register another Player");
    expect(thankYouHtml).not.toContain("btn-neutral");
    expect(thankYouHtml).toContain(PUBLIC_PRIMARY_BUTTON_CLASS);
  });

  it("preselects the first offered fee option for a matching registrable Batch and resets to it", () => {
    const batches = [
      {
        id: "batch-1",
        name: "U-14 evening",
        feeOptions: [
          {
            id: "fee-1a",
            daysPerWeek: 3,
            termDays: 30,
            feePaise: 1500000,
            label: "Weekday nets",
          },
          {
            id: "fee-1b",
            daysPerWeek: 5,
            termDays: 30,
            feePaise: 2200000,
            label: "Full week",
          },
        ],
      },
      {
        id: "batch-2",
        name: "U-16 morning",
        feeOptions: [
          {
            id: "fee-2a",
            daysPerWeek: 3,
            termDays: 30,
            feePaise: 1600000,
            label: "Morning standard",
          },
          {
            id: "fee-2b",
            daysPerWeek: 6,
            termDays: 30,
            feePaise: 2500000,
            label: "Morning intensive",
          },
        ],
      },
    ];

    const matchedHtml = renderToStaticMarkup(
      <ConversionView
        conversion={makeConversion({ batches })}
        initialBatchId="batch-2"
      />,
    );
    expect(matchedHtml).toMatch(/<input[^>]*value="fee-2a"[^>]*>/);
    expect(matchedHtml.match(/<input[^>]*value="fee-2a"[^>]*>/)?.[0]).toContain(
      'checked=""',
    );
    expect(
      matchedHtml.match(/<input[^>]*value="fee-1a"[^>]*>/)?.[0],
    ).not.toContain('checked=""');
    expect(
      matchedHtml.match(/<input[^>]*value="fee-2b"[^>]*>/)?.[0],
    ).not.toContain('checked=""');

    for (const initialBatchId of [undefined, null, "", "   ", "unknown-batch"]) {
      const unmatchedHtml = renderToStaticMarkup(
        <ConversionView
          conversion={makeConversion({ batches })}
          initialBatchId={initialBatchId}
        />,
      );
      expect(unmatchedHtml).not.toContain("checked=\"\"");
      expect(unmatchedHtml).not.toContain("border-2 border-primary");
    }

    expect(emptyValues(batches, "batch-2").batchFeeOptionId).toBe("fee-2a");
    expect(emptyValues(batches, "unknown-batch").batchFeeOptionId).toBe("");
    expect(emptyValues(batches, "").batchFeeOptionId).toBe("");
    expect(emptyValues(batches).batchFeeOptionId).toBe("");
  });

  it("renders the Owner's Brochure editor fields in order and live-previews theme, logo, and About", () => {
    const html = renderToStaticMarkup(
      <BrochureEditor
        brochure={{
          name: "Blitz Cricket Academy",
          slug: "blitz-cricket",
          tagline: "Evening nets",
          aboutLabel: "About Us",
          about: "Coach-led training.",
          logoStorageKey: "academies/a/academy-logo/logo.png",
          logoUrl: "https://blob.test/academies/a/academy-logo/logo.png",
          themeMode: "light",
          themeAccent: "crimson",
          location: "Koramangala",
          phone: "9876543210",
          instagramUrl: null,
          whatsapp: null,
          isIntakeAvailable: false,
          images: [],
          youtubeUrls: [],
          batches: [],
          coaches: [],
        }}
      />,
    );

    const previewIndex = html.indexOf(">Preview<");
    const formMarkup = html.slice(0, previewIndex);
    const nameAt = formMarkup.indexOf('name="name"');
    const logoAt = formMarkup.indexOf(">Academy logo<");
    const appearanceAt = formMarkup.indexOf(">Appearance<");
    const taglineAt = formMarkup.indexOf(">Tagline<");
    const aboutHeadingAt = formMarkup.indexOf('name="aboutLabel"');
    const aboutAt = formMarkup.indexOf('name="about"');
    const locationAt = formMarkup.indexOf('name="location"');
    expect(logoAt).toBeGreaterThan(nameAt);
    expect(appearanceAt).toBeGreaterThan(logoAt);
    expect(taglineAt).toBeGreaterThan(appearanceAt);
    expect(aboutHeadingAt).toBeGreaterThan(taglineAt);
    expect(aboutAt).toBeGreaterThan(aboutHeadingAt);
    expect(locationAt).toBeGreaterThan(aboutAt);
    expect(formMarkup).toContain("Replace logo");
    expect(formMarkup).toContain("Remove logo");
    expect(formMarkup).toContain("max-h-16 w-auto object-contain");
    expect(formMarkup).not.toContain(">Details<");
    expect(formMarkup).toMatch(
      /<button[^>]*aria-pressed="false"[^>]*>Dark<\/button>/,
    );
    expect(formMarkup).toMatch(
      /<button[^>]*aria-pressed="true"[^>]*>Light<\/button>/,
    );
    for (const accent of ACADEMY_THEME_ACCENTS) {
      expect(formMarkup).toContain(`data-accent="${accent}"`);
    }

    const previewWrapperStart = html.lastIndexOf("<section", previewIndex);
    const previewWrapperTag = html.slice(previewWrapperStart, previewIndex);
    const previewSection = html.slice(previewWrapperStart);
    expect(previewWrapperTag).toContain('data-theme="light"');
    expect(previewWrapperTag).toContain("--color-primary:#e11d48");
    expect(previewWrapperTag).toContain("overflow-clip");
    expect(previewWrapperTag).not.toContain("overflow-hidden");
    expect(previewSection).toContain("Contact Us");
    expect(previewSection).toContain("+919876543210");
    expect(previewSection).toContain("Coach-led training.");
    expect(previewSection).toContain(
      encodeURIComponent("https://blob.test/academies/a/academy-logo/logo.png"),
    );
    expect(previewSection).not.toContain("fixed inset-x-0 bottom-0");
    expect(previewSection).not.toContain("btn-neutral");

    const uploadHtml = renderToStaticMarkup(
      <BrochureEditor
        brochure={{
          name: "Blitz Cricket Academy",
          slug: "blitz-cricket",
          tagline: null,
          aboutLabel: "About Us",
          about: null,
          logoStorageKey: null,
          logoUrl: null,
          themeMode: "dark",
          themeAccent: "default",
          location: null,
          phone: null,
          instagramUrl: null,
          whatsapp: null,
          isIntakeAvailable: false,
          images: [],
          youtubeUrls: [],
          batches: [],
          coaches: [],
        }}
      />,
    );
    const uploadFormMarkup = uploadHtml.slice(0, uploadHtml.indexOf(">Preview<"));
    expect(uploadFormMarkup).toContain("Upload logo");
    expect(uploadFormMarkup).not.toContain("Remove logo");

    const batchPreviewHtml = renderToStaticMarkup(
      <BrochureEditor
        brochure={{
          name: "Blitz Cricket Academy",
          slug: "blitz-cricket",
          tagline: null,
          aboutLabel: "About Us",
          about: null,
          logoStorageKey: null,
          logoUrl: null,
          themeMode: "dark",
          themeAccent: "default",
          location: null,
          phone: null,
          instagramUrl: null,
          whatsapp: null,
          isIntakeAvailable: true,
          images: [],
          youtubeUrls: [],
          batches: [
            {
              id: "batch-open",
              name: "U-14 evening",
              blurb: "Evening nets",
              isRegistrable: true,
            },
            {
              id: "batch-closed",
              name: "U-16 morning",
              blurb: "Morning nets",
              isRegistrable: false,
            },
          ],
          coaches: [],
        }}
      />,
    );
    const batchPreviewSection = batchPreviewHtml.slice(
      batchPreviewHtml.indexOf(">Preview<"),
    );
    const previewBatches =
      batchPreviewSection.match(/<section[^>]*id="batches"[\s\S]*?<\/section>/)?.[0] ??
      "";
    const previewCards =
      previewBatches.match(/<article[\s\S]*?<\/article>/g) ?? [];
    expect(previewCards).toHaveLength(2);
    expect(previewCards[0]).toContain("Open for Registration");
    expect(previewCards[0]).toContain("badge-success");
    expect(previewCards[0]).toContain(
      'href="/a/blitz-cricket/join?batch=batch-open"',
    );
    expect(previewCards[1]).toContain("Registration closed");
    expect(previewCards[1]).toContain("badge-error");
    expect(previewCards[1]).not.toContain("/join");
  });

  it("renders ConversionView header logo link and theme across open, closed, and off states", () => {
    const customOpenHtml = renderToStaticMarkup(
      <ConversionView
        conversion={makeConversion({
          logoUrl: "https://blob.test/academies/a/academy-logo/crest.png",
          themeMode: "light",
          themeAccent: "emerald",
          isIntakeAvailable: true,
        })}
      />,
    );
    expect(customOpenHtml).toContain('data-theme="light"');
    expect(customOpenHtml).toContain("--color-primary:#10b981");
    expect(customOpenHtml).toContain("--color-primary-content:#022c22");
    const customOpenHeader =
      customOpenHtml.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(customOpenHeader).toContain('href="/a/blitz-cricket"');
    expect(customOpenHeader).toContain('class="inline-flex items-center"');
    expect(customOpenHeader).toContain('alt="Blitz Cricket Academy logo"');
    expect(customOpenHeader).toContain(
      encodeURIComponent("https://blob.test/academies/a/academy-logo/crest.png"),
    );
    expect(customOpenHtml).toContain("Submit Registration");

    const closedDarkHtml = renderToStaticMarkup(
      <ConversionView
        conversion={makeConversion({
          logoUrl: null,
          themeMode: "dark",
          themeAccent: "blue",
          isOnlineRegistrationAllowed: true,
          isIntakeAvailable: false,
        })}
      />,
    );
    expect(closedDarkHtml).toContain('data-theme="dark"');
    expect(closedDarkHtml).toContain("--color-primary:#2563eb");
    const closedHeader =
      closedDarkHtml.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(closedHeader).toContain('href="/a/blitz-cricket"');
    expect(closedHeader).toContain('src="/logo-white.svg"');
    expect(closedDarkHtml).toContain("Intake is closed.");

    const offLightHtml = renderToStaticMarkup(
      <ConversionView
        conversion={makeConversion({
          logoUrl: null,
          themeMode: "light",
          themeAccent: "orange",
          isOnlineRegistrationAllowed: false,
          isIntakeAvailable: false,
          phone: "+919876543210",
        })}
      />,
    );
    expect(offLightHtml).toContain('data-theme="light"');
    expect(offLightHtml).toContain("--color-primary:#ea580c");
    const offHeader =
      offLightHtml.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(offHeader).toContain('href="/a/blitz-cricket"');
    expect(offHeader).toContain('src="/logo-black.svg"');
    expect(offLightHtml).toContain("Online Registration is off.");
    expect(offLightHtml).toContain('href="tel:+919876543210"');
    expect(offLightHtml).not.toContain("Follow us on Instagram");
    expect(offLightHtml).not.toContain("Chat with us");
    expect(offLightHtml).not.toContain("https://wa.me/");
  });

  it("renders WhatsApp, Same as phone checkbox, and Instagram in BrochureEditor with frame preview and reload hydration", () => {
    const html = renderToStaticMarkup(
      <BrochureEditor
        brochure={{
          name: "Blitz Cricket Academy",
          slug: "blitz-cricket",
          tagline: "Evening nets",
          aboutLabel: "About Us",
          about: "Coach-led training.",
          logoStorageKey: null,
          logoUrl: null,
          themeMode: "dark",
          themeAccent: "default",
          location: "Koramangala",
          phone: "+919876543210",
          instagramUrl: "https://www.instagram.com/Elite_Cricket",
          whatsapp: "+919876543210",
          isIntakeAvailable: false,
          images: [],
          youtubeUrls: [],
          batches: [],
          coaches: [],
        }}
      />,
    );

    const previewIndex = html.indexOf(">Preview<");
    const formMarkup = html.slice(0, previewIndex);
    const previewMarkup = html.slice(previewIndex);

    const phoneAt = formMarkup.indexOf('name="phone"');
    const whatsappAt = formMarkup.indexOf('name="whatsapp"');
    const sameAsPhoneAt = formMarkup.indexOf('name="whatsappSameAsPhone"');
    const instagramAt = formMarkup.indexOf('name="instagram"');
    const galleryAt = formMarkup.indexOf(">Gallery images<");

    expect(whatsappAt).toBeGreaterThan(phoneAt);
    expect(sameAsPhoneAt).toBeGreaterThan(whatsappAt);
    expect(instagramAt).toBeGreaterThan(sameAsPhoneAt);
    expect(galleryAt).toBeGreaterThan(instagramAt);

    expect(formMarkup).toContain('value="https://www.instagram.com/Elite_Cricket"');
    const whatsappInput =
      formMarkup.match(/<input[^>]*name="whatsapp"[^>]*>/)?.[0] ?? "";
    expect(whatsappInput).toContain('value="+919876543210"');
    const sameCheckbox =
      formMarkup.match(/<input[^>]*name="whatsappSameAsPhone"[^>]*>/)?.[0] ?? "";
    expect(sameCheckbox).toContain('checked=""');

    expect(previewMarkup).toContain("Follow us on Instagram");
    expect(previewMarkup).toContain('href="https://www.instagram.com/Elite_Cricket"');
    expect(previewMarkup).toContain("Chat with us");
    expect(previewMarkup).toContain("absolute right-6 bottom-6 z-30");
    expect(previewMarkup).not.toContain("fixed right-6 bottom-6 z-30");

    const separateHtml = renderToStaticMarkup(
      <BrochureEditor
        brochure={{
          name: "Blitz Cricket Academy",
          slug: "blitz-cricket",
          tagline: null,
          aboutLabel: "About Us",
          about: null,
          logoStorageKey: null,
          logoUrl: null,
          themeMode: "dark",
          themeAccent: "default",
          location: null,
          phone: "+919876543210",
          instagramUrl: null,
          whatsapp: "+919123456789",
          isIntakeAvailable: false,
          images: [],
          youtubeUrls: [],
          batches: [],
          coaches: [],
        }}
      />,
    );
    const separateForm = separateHtml.slice(0, separateHtml.indexOf(">Preview<"));
    const separateCheckbox =
      separateForm.match(/<input[^>]*name="whatsappSameAsPhone"[^>]*>/)?.[0] ?? "";
    expect(separateCheckbox).not.toContain('checked=""');
  });

  it("syncs Phone into WhatsApp when Same as phone is checked and allows a separate WhatsApp when unchecked", () => {
    const start = initialPhoneSyncState(null, null);
    expect(start).toEqual({
      phone: "",
      whatsapp: "",
      whatsappSameAsPhone: false,
    });

    const typedPhone = changeEditorPhone(start, "9876543210");
    expect(typedPhone).toEqual({
      phone: "9876543210",
      whatsapp: "",
      whatsappSameAsPhone: false,
    });

    const checked = toggleWhatsappSameAsPhone(typedPhone, true);
    expect(checked).toEqual({
      phone: "9876543210",
      whatsapp: "9876543210",
      whatsappSameAsPhone: true,
    });

    const updatedPhoneWhileChecked = changeEditorPhone(checked, "+919876543210");
    expect(updatedPhoneWhileChecked).toEqual({
      phone: "+919876543210",
      whatsapp: "+919876543210",
      whatsappSameAsPhone: true,
    });

    const editedWhatsappManually = changeEditorWhatsapp(
      updatedPhoneWhileChecked,
      "+919123456789",
    );
    expect(editedWhatsappManually).toEqual({
      phone: "+919876543210",
      whatsapp: "+919123456789",
      whatsappSameAsPhone: false,
    });

    const rechecked = toggleWhatsappSameAsPhone(editedWhatsappManually, true);
    expect(rechecked).toEqual({
      phone: "+919876543210",
      whatsapp: "+919876543210",
      whatsappSameAsPhone: true,
    });

    const unchecked = toggleWhatsappSameAsPhone(rechecked, false);
    expect(unchecked).toEqual({
      phone: "+919876543210",
      whatsapp: "+919876543210",
      whatsappSameAsPhone: false,
    });

    const reloadedMatch = initialPhoneSyncState("+919876543210", "+919876543210");
    expect(reloadedMatch.whatsappSameAsPhone).toBe(true);
  });
});
