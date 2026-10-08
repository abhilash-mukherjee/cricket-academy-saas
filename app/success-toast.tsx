"use client";

import { useEffect } from "react";

const DISMISS_MS = 5000;

type SuccessToastProps = {
  message: string | null;
  onDismiss: () => void;
};

export function SuccessToast({ message, onDismiss }: SuccessToastProps) {
  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = window.setTimeout(onDismiss, DISMISS_MS);
    return () => window.clearTimeout(timeoutId);
  }, [message, onDismiss]);

  if (!message) {
    return null;
  }

  return (
    <div className="toast toast-bottom toast-center z-50 sm:toast-end">
      <div role="status" className="alert alert-success max-w-sm">
        <span>{message}</span>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
