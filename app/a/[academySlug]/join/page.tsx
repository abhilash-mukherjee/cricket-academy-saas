import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicBrochure } from "@/lib/public-brochure";
import { ACADEMY_NOT_FOUND, APP_NAME } from "@/lib/constants";

type ConversionPageProps = PageProps<"/a/[academySlug]/join">;

const noindex = { index: false, follow: false } as const;

export async function generateMetadata({
  params,
}: ConversionPageProps): Promise<Metadata> {
  const { academySlug } = await params;
  const brochure = await getPublicBrochure(academySlug);
  if (!brochure) {
    return { title: ACADEMY_NOT_FOUND, robots: noindex };
  }

  return {
    title: brochure.name,
    robots: noindex,
  };
}

export default async function ConversionPage({ params }: ConversionPageProps) {
  const { academySlug } = await params;
  const brochure = await getPublicBrochure(academySlug);
  if (!brochure) {
    notFound();
  }

  return (
    <div className="bg-base-100 min-h-dvh">
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
        <h1 className="text-3xl font-bold">{brochure.name}</h1>
        <p>Registration for this Academy will open here.</p>
      </main>
      <footer className="text-base-content/60 p-6 text-center text-sm">
        Built with {APP_NAME}
      </footer>
    </div>
  );
}
