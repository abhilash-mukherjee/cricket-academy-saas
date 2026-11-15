import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { LinkPendingMark } from "@/app/app/link-pending-mark";
import { publicAcademyThemeStyle } from "@/lib/academy-theme";
import {
  getPublicConversion,
  type PublicConversion,
} from "@/lib/public-conversion";
import { ACADEMY_NOT_FOUND, APP_NAME } from "@/lib/constants";
import { AcademyLogoMark } from "../academy-logo";
import { BrochurePhone } from "../brochure-phone";
import { RegistrationForm } from "./registration-form";

type ConversionPageProps = PageProps<"/a/[academySlug]/join">;

/**
 * Conversion profile: purge on mutation plus safety TTL (ADR 0028).
 * Next.js requires a numeric literal here; keep in sync with PUBLIC_CONVERSION_CACHE_SECONDS.
 */
export const revalidate = 300;

const noindex = { index: false, follow: false } as const;

export async function generateMetadata({
  params,
}: ConversionPageProps): Promise<Metadata> {
  const { academySlug } = await params;
  const conversion = await getPublicConversion(academySlug);
  if (!conversion) {
    return { title: ACADEMY_NOT_FOUND, robots: noindex };
  }

  return {
    title: conversion.name,
    robots: noindex,
  };
}

/** Public registration view rendered under `/a/[academySlug]/join`. */
export function ConversionView({
  conversion,
}: {
  conversion: PublicConversion;
}) {
  return (
    <div
      data-theme={conversion.themeMode}
      style={publicAcademyThemeStyle(conversion.themeAccent)}
      className="bg-base-100 text-base-content min-h-dvh"
    >
      <header className="navbar bg-base-100/75 sticky top-0 z-30 h-16 px-4 backdrop-blur-md">
        <div className="flex-1">
          <Link
            href={`/a/${conversion.slug}`}
            className="inline-flex items-center"
          >
            <AcademyLogoMark
              name={conversion.name}
              logoUrl={conversion.logoUrl}
              themeMode={conversion.themeMode}
            />
            <LinkPendingMark />
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
        <h1 className="text-3xl font-bold">{conversion.name}</h1>
        {conversion.isIntakeAvailable ? (
          <RegistrationForm
            academySlug={conversion.slug}
            batches={conversion.batches}
            upiQrUrl={conversion.upiQrUrl}
          />
        ) : conversion.isOnlineRegistrationAllowed ? (
          <>
            <p>Intake is closed.</p>
            <Link className="link" href={`/a/${conversion.slug}`}>
              Brochure
            </Link>
          </>
        ) : (
          <>
            <p>Online Registration is off.</p>
            {conversion.phone ? (
              <BrochurePhone phone={conversion.phone} />
            ) : null}
          </>
        )}
      </main>
      <footer className="text-base-content/60 p-6 text-center text-sm">
        Built with {APP_NAME}
      </footer>
    </div>
  );
}

export default async function ConversionPage({ params }: ConversionPageProps) {
  const { academySlug } = await params;
  const conversion = await getPublicConversion(academySlug);
  if (!conversion) {
    notFound();
  }

  return <ConversionView conversion={conversion} />;
}
