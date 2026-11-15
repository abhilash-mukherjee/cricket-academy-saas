import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AcademyBrochurePage from "./page";
import AcademyNotFound from "./not-found";
import { BrochureView } from "./brochure-view";
import {
  HERO_CAROUSEL_INTERVAL_MS,
  startHeroCarouselTimer,
} from "./brochure-gallery";
import { RegistrationForm } from "./join/registration-form";
import { RegistrationThankYou } from "./join/registration-thank-you";
import { BrochureEditor } from "@/app/app/brochure/brochure-editor";
import { ACADEMY_NOT_FOUND } from "@/lib/constants";
import type { PublicBrochure } from "@/lib/public-brochure";
import { PUBLIC_PRIMARY_BUTTON_CLASS } from "./public-button";

function makeBrochure(overrides: Partial<PublicBrochure> = {}): PublicBrochure {
  return {
    name: "Blitz Cricket Academy",
    slug: "blitz-cricket",
    tagline: "Match-day readiness",
    location: "Koramangala",
    phone: "+919876543210",
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
          batches: [{ name: "U-14 evening", blurb: "Batting and fielding" }],
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

  it("overlays hero details and switches the hero CTA between Register, Call to Register, and omitted", () => {
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
    expect(openHero).toContain("Register");
    expect(openHero).not.toContain("Call to Register");
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
    expect(callHero).toContain("Call to Register");
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
    expect(omittedHero).not.toContain("Call to Register");
  });

  it("stacks Videos, Batches, and Coaches in a single column below the hero with anchor targets", () => {
    const html = renderToStaticMarkup(
      <BrochureView
        brochure={makeBrochure({
          youtubeVideoIds: ["jNQXAC9IVRw"],
          batches: [{ name: "U-14 evening", blurb: "Evening nets" }],
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

  it("renders the Owner's Brochure editor preview in the dark theme with canonical Phone and no bottom floating CTA bar", () => {
    const html = renderToStaticMarkup(
      <BrochureEditor
        brochure={{
          name: "Blitz Cricket Academy",
          slug: "blitz-cricket",
          tagline: "Evening nets",
          location: "Koramangala",
          phone: "9876543210",
          isIntakeAvailable: false,
          images: [],
          youtubeUrls: [],
          batches: [],
          coaches: [],
        }}
      />,
    );

    const previewIndex = html.indexOf(">Preview<");
    const previewWrapperStart = html.lastIndexOf("<section", previewIndex);
    const previewWrapperTag = html.slice(previewWrapperStart, previewIndex);
    const previewSection = html.slice(previewWrapperStart);
    expect(previewWrapperTag).toContain('data-theme="dark"');
    expect(previewWrapperTag).toContain("overflow-clip");
    expect(previewWrapperTag).not.toContain("overflow-hidden");
    expect(previewSection).toContain("Call to Register");
    expect(previewSection).toContain("+919876543210");
    expect(previewSection).not.toContain("fixed inset-x-0 bottom-0");
    expect(previewSection).not.toContain("btn-neutral");
  });
});
