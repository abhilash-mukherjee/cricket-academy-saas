import Image from "next/image";
import Link from "next/link";
import { LinkPendingMark } from "@/app/app/link-pending-mark";
import {
  publicAcademyThemeStyle,
  resolveAboutLabel,
  resolveAcademyThemeAccent,
  resolveAcademyThemeMode,
  type AcademyThemeMode,
} from "@/lib/academy-theme";
import { AcademyLogoMark } from "./academy-logo";
import type { PublicBrochure } from "@/lib/public-brochure";
import { BrochureCarousel } from "./brochure-gallery";
import { BrochureMenu, HeroScrollNudge } from "./brochure-header";
import { BrochureLocation } from "./brochure-location";
import { BrochurePhone } from "./brochure-phone";
import { BrochureYoutube } from "./brochure-youtube";
import { PUBLIC_PRIMARY_BUTTON_CLASS } from "./public-button";

type BrochureViewProps = {
  brochure: PublicBrochure;
};

function BrochureHeader({
  name,
  slug,
  phone,
  logoUrl,
  themeMode,
  isIntakeAvailable,
  hasAbout,
  aboutLabel,
  hasBatches,
  hasCoaches,
}: {
  name: string;
  slug: string;
  phone: string | null;
  logoUrl: string | null;
  themeMode: AcademyThemeMode;
  isIntakeAvailable: boolean;
  hasAbout: boolean;
  aboutLabel: string;
  hasBatches: boolean;
  hasCoaches: boolean;
}) {
  const hasMenuOptions =
    isIntakeAvailable || Boolean(phone) || hasAbout || hasBatches || hasCoaches;

  return (
    <header className="navbar bg-base-100/75 sticky top-0 z-30 -mb-16 h-16 px-4 backdrop-blur-md">
      <div className="flex-1">
        <span className="inline-flex items-center">
          <AcademyLogoMark
            name={name}
            logoUrl={logoUrl}
            themeMode={themeMode}
          />
        </span>
      </div>
      {hasMenuOptions ? (
        <BrochureMenu
          slug={slug}
          phone={phone}
          isIntakeAvailable={isIntakeAvailable}
          hasAbout={hasAbout}
          aboutLabel={aboutLabel}
          hasBatches={hasBatches}
          hasCoaches={hasCoaches}
        />
      ) : null}
    </header>
  );
}

function HeroBackground({ images }: { images: { url: string }[] }) {
  if (images.length === 0) {
    return null;
  }

  if (images.length === 1) {
    return (
      <div aria-hidden="true" className="absolute inset-0">
        <Image
          src={images[0].url}
          alt=""
          fill
          preload
          sizes="100vw"
          className="object-cover"
        />
      </div>
    );
  }

  return <BrochureCarousel images={images} />;
}

function HeroCta({
  slug,
  phone,
  isIntakeAvailable,
}: {
  slug: string;
  phone: string | null;
  isIntakeAvailable: boolean;
}) {
  if (isIntakeAvailable) {
    return (
      <Link
        href={`/a/${slug}/join`}
        className={`${PUBLIC_PRIMARY_BUTTON_CLASS} btn-lg`}
      >
        Register
        <LinkPendingMark />
      </Link>
    );
  }

  if (phone) {
    return (
      <a
        href={`tel:${phone}`}
        className={`${PUBLIC_PRIMARY_BUTTON_CLASS} btn-lg`}
      >
        Call to Register
      </a>
    );
  }

  return null;
}

/** Public Academy Brochure view shared by /a/{slug} and the Owner's editor preview. */
export function BrochureView({ brochure }: BrochureViewProps) {
  const hasAbout = Boolean(brochure.about?.trim());
  const aboutLabel = resolveAboutLabel(brochure.aboutLabel);
  const themeMode = resolveAcademyThemeMode(brochure.themeMode);
  const themeAccent = resolveAcademyThemeAccent(brochure.themeAccent);
  const hasHeroImages = brochure.images.length > 0;
  const heroTextClass = hasHeroImages
    ? "text-neutral-content"
    : "text-base-content";
  const heroTaglineClass = hasHeroImages
    ? "text-neutral-content/85"
    : "text-base-content/85";
  const heroMetaClass = hasHeroImages
    ? "text-neutral-content/90"
    : "text-base-content/90";

  const hasBelowHeroContent =
    hasAbout ||
    brochure.youtubeVideoIds.length > 0 ||
    brochure.batches.length > 0 ||
    brochure.coaches.length > 0;

  return (
    <div
      data-theme={themeMode}
      style={publicAcademyThemeStyle(themeAccent)}
      data-brochure-root=""
      className="@container bg-base-100 text-base-content"
    >
      <BrochureHeader
        name={brochure.name}
        slug={brochure.slug}
        phone={brochure.phone}
        logoUrl={brochure.logoUrl}
        themeMode={themeMode}
        isIntakeAvailable={brochure.isIntakeAvailable}
        hasAbout={hasAbout}
        aboutLabel={aboutLabel}
        hasBatches={brochure.batches.length > 0}
        hasCoaches={brochure.coaches.length > 0}
      />
      <main>
        <section
          aria-label="Academy hero"
          className="from-base-300 via-base-200 to-base-100 relative flex min-h-dvh flex-col justify-center overflow-hidden bg-gradient-to-b"
        >
          <HeroBackground images={brochure.images} />
          {hasHeroImages ? (
            <div aria-hidden="true" className="bg-neutral/65 absolute inset-0" />
          ) : null}
          <div
            className={`relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 pt-24 pb-16 text-center ${heroTextClass}`}
          >
            <h1 className="text-4xl font-bold sm:text-5xl">{brochure.name}</h1>
            {brochure.tagline ? (
              <p
                className={`${heroTaglineClass} max-w-2xl text-lg whitespace-pre-wrap`}
              >
                {brochure.tagline}
              </p>
            ) : null}
            {brochure.location || brochure.phone ? (
              <div
                className={`${heroMetaClass} flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm`}
              >
                {brochure.location ? (
                  <BrochureLocation location={brochure.location} />
                ) : null}
                {brochure.phone ? (
                  <BrochurePhone phone={brochure.phone} />
                ) : null}
              </div>
            ) : null}
            <HeroCta
              slug={brochure.slug}
              phone={brochure.phone}
              isIntakeAvailable={brochure.isIntakeAvailable}
            />
          </div>
          {hasBelowHeroContent ? (
            <HeroScrollNudge hasHeroImages={hasHeroImages} />
          ) : null}
        </section>

        {hasBelowHeroContent ? (
          <div
            data-brochure-content=""
            className="mx-auto flex w-full max-w-3xl scroll-mt-16 flex-col gap-10 px-6 py-12"
          >
            {hasAbout ? (
              <section id="about" className="flex scroll-mt-20 flex-col gap-4">
                <h2 className="text-xl font-semibold">{aboutLabel}</h2>
                <article className="card bg-base-200">
                  <div className="card-body">
                    <p className="whitespace-pre-wrap">{brochure.about}</p>
                  </div>
                </article>
              </section>
            ) : null}

            {brochure.youtubeVideoIds.length > 0 ? (
              <section className="flex flex-col gap-4" aria-label="Videos">
                {brochure.youtubeVideoIds.map((videoId) => (
                  <BrochureYoutube key={videoId} videoId={videoId} />
                ))}
              </section>
            ) : null}

            {brochure.batches.length > 0 ? (
              <section
                id="batches"
                className="flex scroll-mt-20 flex-col gap-4"
              >
                <h2 className="text-xl font-semibold">Batches</h2>
                <div className="flex flex-col gap-3">
                  {brochure.batches.map((batch) => (
                    <article key={batch.name} className="card bg-base-200">
                      <div className="card-body gap-1">
                        <h3 className="card-title text-base">{batch.name}</h3>
                        {batch.blurb ? <p>{batch.blurb}</p> : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {brochure.coaches.length > 0 ? (
              <section
                id="coaches"
                className="flex scroll-mt-20 flex-col gap-4"
              >
                <h2 className="text-xl font-semibold">Coaches</h2>
                <div className="flex flex-col gap-3">
                  {brochure.coaches.map((coach) => (
                    <article key={coach.fullName} className="card bg-base-200">
                      <div className="card-body gap-2">
                        {coach.imageUrl ? (
                          <Image
                            src={coach.imageUrl}
                            alt=""
                            width={128}
                            height={128}
                            sizes="8rem"
                            className="h-32 w-32 rounded-box object-cover"
                          />
                        ) : null}
                        <h3 className="card-title text-base">
                          {coach.fullName}
                        </h3>
                        {coach.blurb ? <p>{coach.blurb}</p> : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
