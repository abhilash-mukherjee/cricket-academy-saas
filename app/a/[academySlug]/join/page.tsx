import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getPublicConversion } from "@/lib/public-conversion";
import { ACADEMY_NOT_FOUND, APP_NAME } from "@/lib/constants";
import { BrochureCta } from "../brochure-cta";
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

export default async function ConversionPage({ params }: ConversionPageProps) {
  const { academySlug } = await params;
  const conversion = await getPublicConversion(academySlug);
  if (!conversion) {
    notFound();
  }

  const showCopyPhone =
    !conversion.isOnlineRegistrationAllowed && Boolean(conversion.phone);

  return (
    <div
      className={
        showCopyPhone ? "bg-base-100 min-h-dvh pb-20" : "bg-base-100 min-h-dvh"
      }
    >
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
      {showCopyPhone ? (
        <BrochureCta
          slug={conversion.slug}
          phone={conversion.phone}
          isIntakeAvailable={false}
          placement="viewport"
        />
      ) : null}
      <footer className="text-base-content/60 p-6 text-center text-sm">
        Built with {APP_NAME}
      </footer>
    </div>
  );
}
