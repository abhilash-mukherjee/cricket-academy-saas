import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
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

function formatInr(feePaise: number): string {
  return `₹${(feePaise / 100).toLocaleString("en-IN")}`;
}

function daysCopy(daysPerWeek: number): string {
  return daysPerWeek === 1 ? "1 day per week" : `${daysPerWeek} days per week`;
}

function termCopy(termMonths: number): string {
  return termMonths === 1 ? "1 month" : `${termMonths} months`;
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
            <p>This is not a Registration form yet.</p>
            {conversion.batches.map((batch) => (
              <section key={batch.name} className="flex flex-col gap-3">
                <h2 className="text-xl font-semibold">{batch.name}</h2>
                <ul className="flex flex-col gap-2">
                  {batch.feeOptions.map((option) => (
                    <li
                      key={`${option.daysPerWeek}-${option.termMonths}`}
                      className="card bg-base-200"
                    >
                      <div className="card-body gap-1 py-3">
                        {option.label ? (
                          <p className="font-medium">{option.label}</p>
                        ) : null}
                        <p>
                          {daysCopy(option.daysPerWeek)} ·{" "}
                          {termCopy(option.termMonths)} ·{" "}
                          {formatInr(option.feePaise)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
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
          <>
            <p>Intake is closed.</p>
            <Link className="link" href={`/a/${conversion.slug}`}>
              Brochure
            </Link>
          </>
        )}
      </main>
      <footer className="text-base-content/60 p-6 text-center text-sm">
        Built with {APP_NAME}
      </footer>
    </div>
  );
}
