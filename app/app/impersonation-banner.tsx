"use client";

import { useState } from "react";

type ImpersonationBannerProps = {
  academyName: string;
  ownerEmail: string;
};

export function ImpersonationBanner({
  academyName,
  ownerEmail,
}: ImpersonationBannerProps) {
  const [pending, setPending] = useState(false);

  async function exit() {
    setPending(true);
    try {
      const response = await fetch("/api/admin/impersonation/exit", {
        method: "POST",
      });
      if (!response.ok) {
        setPending(false);
        return;
      }
      const body = (await response.json()) as { redirectTo: string };
      // Full navigation; avoids useRouter (breaks SSR tests).
      window.location.assign(body.redirectTo); // eslint-disable-line @next/next/no-location-assign-relative-destination
    } catch {
      setPending(false);
    }
  }

  return (
    <div
      role="status"
      className="bg-warning text-warning-content flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm"
    >
      <p>
        Impersonating {ownerEmail} · {academyName}
      </p>
      <button
        type="button"
        className="btn btn-sm"
        disabled={pending}
        onClick={() => void exit()}
      >
        Exit impersonation
      </button>
    </div>
  );
}
