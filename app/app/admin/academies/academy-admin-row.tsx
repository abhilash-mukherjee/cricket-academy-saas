"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminAcademyListItem } from "@/lib/admin-academies";

type AcademyAdminRowProps = {
  academy: AdminAcademyListItem;
  brochureHref: string;
  conversionHref: string;
};

export function AcademyAdminRow({
  academy,
  brochureHref,
  conversionHref,
}: AcademyAdminRowProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ownerLabel = academy.ownerEmail ?? academy.pendingOwnerEmail ?? "—";
  // Fixed locale/timezone so SSR and client match (avoids hydration mismatch).
  const createdLabel = new Date(academy.createdAt).toLocaleDateString("en-CA", {
    timeZone: "UTC",
  });

  async function runAction(
    label: string,
    path: string,
    options?: { navigateTo?: string },
  ) {
    setPending(label);
    setError(null);
    try {
      const response = await fetch(path, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? `Could not ${label}.`);
        setPending(null);
        return;
      }
      if (options?.navigateTo) {
        window.location.assign(options.navigateTo); // eslint-disable-line @next/next/no-location-assign-relative-destination
        return;
      }
      setPending(null);
      router.refresh();
    } catch {
      setError(`Could not ${label}.`);
      setPending(null);
    }
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="font-medium">
          {academy.name}
          {!academy.isActive ? (
            <span className="text-base-content/60 ml-2 text-sm font-normal">
              (deactivated)
            </span>
          ) : null}
        </p>
        <p className="text-base-content/70 font-mono text-sm">{academy.slug}</p>
        <p className="text-base-content/70 text-sm">
          Owner: {ownerLabel}
          {academy.ownerEmail ? null : academy.pendingOwnerEmail ? " (pending)" : ""}
        </p>
        <p className="text-base-content/60 text-sm">Created {createdLabel}</p>
        <p className="flex flex-wrap gap-3 text-sm">
          <a className="link" href={brochureHref} target="_blank" rel="noreferrer">
            Brochure
          </a>
          <a
            className="link"
            href={conversionHref}
            target="_blank"
            rel="noreferrer"
          >
            Conversion
          </a>
        </p>
        {error ? <p className="text-error text-sm">{error}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {academy.isActive ? (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={pending !== null}
            onClick={() =>
              void runAction(
                "deactivate",
                `/api/admin/academies/${academy.id}/deactivate`,
              )
            }
          >
            {pending === "deactivate" ? "…" : "Deactivate"}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={pending !== null}
            onClick={() =>
              void runAction(
                "reactivate",
                `/api/admin/academies/${academy.id}/reactivate`,
              )
            }
          >
            {pending === "reactivate" ? "…" : "Reactivate"}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={pending !== null || !academy.ownerEmail || !academy.isActive}
          onClick={() =>
            void runAction(
              "impersonate",
              `/api/admin/academies/${academy.id}/impersonate`,
              { navigateTo: "/app/dashboard" },
            )
          }
        >
          {pending === "impersonate" ? "…" : "Impersonate"}
        </button>
      </div>
    </li>
  );
}
