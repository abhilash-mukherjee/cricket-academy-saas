import type { PublicBrochure } from "@/lib/public-brochure";

type BrochureViewProps = {
  brochure: PublicBrochure;
};

export function BrochureView({ brochure }: BrochureViewProps) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
      <h1 className="text-3xl font-bold">{brochure.name}</h1>
      {brochure.tagline ? <p className="text-lg">{brochure.tagline}</p> : null}
      {brochure.location ? <p>{brochure.location}</p> : null}
      {brochure.phone ? <p>{brochure.phone}</p> : null}
    </main>
  );
}
