import type { PublicBrochure } from "@/lib/public-brochure";

type BrochureViewProps = {
  brochure: PublicBrochure;
};

export function BrochureView({ brochure }: BrochureViewProps) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{brochure.name}</h1>
        {brochure.tagline ? <p className="text-lg">{brochure.tagline}</p> : null}
        {brochure.location ? <p>{brochure.location}</p> : null}
        {brochure.phone ? <p>{brochure.phone}</p> : null}
      </header>

      {brochure.images.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Photos">
          {brochure.images.map((image) => (
            <img
              key={image.url}
              src={image.url}
              alt=""
              className="h-auto w-full rounded-box"
            />
          ))}
        </section>
      ) : null}

      {brochure.youtubeVideoIds.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Videos">
          {brochure.youtubeVideoIds.map((videoId) => (
            <iframe
              key={videoId}
              src={`https://www.youtube.com/embed/${videoId}`}
              title="YouTube video"
              className="aspect-video w-full rounded-box"
              allowFullScreen
            />
          ))}
        </section>
      ) : null}

      {brochure.batches.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Batches</h2>
          {brochure.batches.map((batch) => (
            <article key={batch.name} className="flex flex-col gap-1">
              <h3 className="font-medium">{batch.name}</h3>
              {batch.blurb ? <p>{batch.blurb}</p> : null}
            </article>
          ))}
        </section>
      ) : null}

      {brochure.coaches.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Coaches</h2>
          {brochure.coaches.map((coach) => (
            <article key={coach.fullName} className="flex flex-col gap-2">
              {coach.imageUrl ? (
                <img
                  src={coach.imageUrl}
                  alt=""
                  className="h-32 w-32 rounded-box object-cover"
                />
              ) : null}
              <h3 className="font-medium">{coach.fullName}</h3>
              {coach.blurb ? <p>{coach.blurb}</p> : null}
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
