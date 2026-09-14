import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BrochureView } from "./brochure-view";
import { getPublicBrochure } from "@/lib/public-brochure";
import { ACADEMY_NOT_FOUND, APP_NAME } from "@/lib/constants";
import { brochureUrl } from "@/lib/public-origin";

type BrochurePageProps = PageProps<"/a/[academySlug]">;

export async function generateMetadata({
  params,
}: BrochurePageProps): Promise<Metadata> {
  const { academySlug } = await params;
  const brochure = await getPublicBrochure(academySlug);
  if (!brochure) {
    return { title: ACADEMY_NOT_FOUND };
  }

  return {
    title: brochure.name,
    description: brochure.tagline ?? undefined,
    alternates: { canonical: brochureUrl(brochure.slug) },
  };
}

export default async function AcademyBrochurePage({
  params,
}: BrochurePageProps) {
  const { academySlug } = await params;
  const brochure = await getPublicBrochure(academySlug);
  if (!brochure) {
    notFound();
  }

  return (
    <div className="bg-base-100 min-h-dvh">
      <BrochureView brochure={brochure} />
      <footer className="text-base-content/60 p-6 text-center text-sm">
        Built with {APP_NAME}
      </footer>
    </div>
  );
}
