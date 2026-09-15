import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { getPublicConversion } from "@/lib/public-conversion";
import { ACADEMY_NOT_FOUND, APP_NAME } from "@/lib/constants";

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

  return (
    <div className="bg-base-100 min-h-dvh">
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
        <h1 className="text-3xl font-bold">{conversion.name}</h1>
        {conversion.isIntakeAvailable ? (
          <>
            <p>Registration for this Academy will open here.</p>
            {conversion.upiQrUrl ? (
              <section className="flex flex-col gap-2" aria-label="UPI QR">
                <h2 className="text-lg font-semibold">Pay with UPI</h2>
                <Image
                  src={conversion.upiQrUrl}
                  alt="Academy UPI QR"
                  width={256}
                  height={256}
                  sizes="16rem"
                  className="h-64 w-64 rounded-box object-contain"
                />
              </section>
            ) : null}
          </>
        ) : (
          <p>Registration is not open for this Academy right now.</p>
        )}
      </main>
      <footer className="text-base-content/60 p-6 text-center text-sm">
        Built with {APP_NAME}
      </footer>
    </div>
  );
}
