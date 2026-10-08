import type { PublicBrochure } from "@/lib/public-brochure";
import { BrochureCta } from "./brochure-cta";
import { BrochureCarousel } from "./brochure-gallery";
import { BrochureLocation } from "./brochure-location";
import { BrochurePhone } from "./brochure-phone";
import { BrochureYoutube } from "./brochure-youtube";
import Image from "next/image";

type BrochureViewProps = {
  brochure: PublicBrochure;
  ctaPlacement?: "viewport" | "frame";
};

function Gallery({ images }: { images: { url: string }[] }) {
  if (images.length === 0) {
    return null;
  }

  if (images.length === 1) {
    return (
      <section aria-label="Photos">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-box">
          <Image
            src={images[0].url}
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 32rem, 100vw"
            className="object-cover"
          />
        </div>
      </section>
    );
  }

  return <BrochureCarousel images={images} />;
}

export function BrochureView({
  brochure,
  ctaPlacement = "viewport",
}: BrochureViewProps) {
  const showCta = brochure.isIntakeAvailable || Boolean(brochure.phone);
  const hasGallery = brochure.images.length > 0;

  const identity = (
    <header className="flex flex-col gap-2 max-lg:order-1">
      <h1 className="text-3xl font-bold">{brochure.name}</h1>
      {brochure.tagline ? (
        <p className="text-lg whitespace-pre-wrap">{brochure.tagline}</p>
      ) : null}
    </header>
  );

  const videos =
    brochure.youtubeVideoIds.length > 0 ? (
      <section
        className="flex flex-col gap-3 max-lg:order-5"
        aria-label="Videos"
      >
        {brochure.youtubeVideoIds.map((videoId) => (
          <BrochureYoutube key={videoId} videoId={videoId} />
        ))}
      </section>
    ) : null;

  const batches =
    brochure.batches.length > 0 ? (
      <section className="flex flex-col gap-3 max-lg:order-6">
        <h2 className="text-xl font-semibold">Batches</h2>
        <div className="grid gap-3">
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
    ) : null;

  const coaches =
    brochure.coaches.length > 0 ? (
      <section className="flex flex-col gap-3 max-lg:order-7">
        <h2 className="text-xl font-semibold">Coaches</h2>
        <div className="grid gap-3">
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
                <h3 className="card-title text-base">{coach.fullName}</h3>
                {coach.blurb ? <p>{coach.blurb}</p> : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    ) : null;

  const contact =
    brochure.location || brochure.phone ? (
      <div className="flex flex-col gap-2 max-lg:order-3">
        {brochure.location ? (
          <BrochureLocation location={brochure.location} />
        ) : null}
        {brochure.phone ? <BrochurePhone phone={brochure.phone} /> : null}
      </div>
    ) : null;

  return (
    <div className={showCta ? "@container pb-20" : "@container"}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
        {hasGallery ? (
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start">
            <div className="max-lg:contents lg:flex lg:flex-col lg:gap-6">
              {identity}
              {videos}
              {batches}
              {coaches}
            </div>
            <div className="max-lg:contents lg:flex lg:flex-col lg:gap-6">
              <div className="max-lg:order-2">
                <Gallery images={brochure.images} />
              </div>
              {contact}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {identity}
            {contact}
            {videos}
            {batches}
            {coaches}
          </div>
        )}
      </main>
      <BrochureCta
        slug={brochure.slug}
        phone={brochure.phone}
        isIntakeAvailable={brochure.isIntakeAvailable}
        placement={ctaPlacement}
      />
    </div>
  );
}
