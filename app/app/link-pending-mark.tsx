"use client";

import { useLinkStatus } from "next/link";

export function LinkPendingMark() {
  const { pending } = useLinkStatus();
  if (!pending) {
    return null;
  }
  return (
    <span className="inline-flex items-center" role="status">
      <span className="loading loading-spinner loading-xs" aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </span>
  );
}
