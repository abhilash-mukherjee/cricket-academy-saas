"use client";

import Link from "next/link";
import { useState } from "react";

type BrochureCtaProps = {
  slug: string;
  phone: string | null;
  isIntakeAvailable: boolean;
  placement: "viewport" | "frame";
};

export function BrochureCta({
  slug,
  phone,
  isIntakeAvailable,
  placement,
}: BrochureCtaProps) {
  const [copied, setCopied] = useState(false);

  if (!isIntakeAvailable && !phone) {
    return null;
  }

  const positionClass =
    placement === "viewport"
      ? "fixed inset-x-0 bottom-0 z-20"
      : "absolute inset-x-0 bottom-0 z-10";

  if (isIntakeAvailable) {
    return (
      <div className={positionClass}>
        <Link
          href={`/a/${slug}/join`}
          className="btn btn-primary w-full rounded-none"
        >
          Register
        </Link>
      </div>
    );
  }

  async function copyPhone() {
    if (!phone) {
      return;
    }

    await navigator.clipboard.writeText(phone);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={positionClass}>
      <button
        type="button"
        className="btn btn-neutral w-full rounded-none"
        onClick={() => void copyPhone()}
      >
        {copied ? "Phone Number Copied" : `Call to Register`}
      </button>
    </div>
  );
}
