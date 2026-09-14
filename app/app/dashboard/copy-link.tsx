"use client";

import { useState } from "react";

type CopyLinkProps = {
  label: string;
  href: string;
};

export function CopyLink({ label, href }: CopyLinkProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="input input-bordered w-full"
          readOnly
          value={href}
          aria-label={label}
        />
        <button type="button" className="btn btn-neutral" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
