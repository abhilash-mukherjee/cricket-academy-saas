"use client";

import { useState } from "react";
import type { ConversionEditorState } from "@/lib/conversion";

type ConversionEditorProps = {
  conversion: ConversionEditorState;
};

function errorCopy(error: string | null): string | null {
  switch (error) {
    case "invalid-storage-key":
      return "The UPI QR must belong to your Academy.";
    case "invalid-type":
      return "Images must be JPEG, PNG, or WebP.";
    case "file-too-large":
      return "Images must be 2 MB or smaller.";
    default:
      return error;
  }
}

export function ConversionEditor({ conversion }: ConversionEditorProps) {
  const [upiQrStorageKey, setUpiQrStorageKey] = useState(
    conversion.upiQrStorageKey,
  );
  const [upiQrUrl, setUpiQrUrl] = useState<string | null>(conversion.upiQrUrl);
  const [isOnlineRegistrationAllowed, setIsOnlineRegistrationAllowed] =
    useState(conversion.isOnlineRegistrationAllowed);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function uploadUpiQr(file: File) {
    setUploading(true);
    setError(null);

    const form = new FormData();
    form.set("purpose", "upi-qr");
    form.set("file", file);

    const response = await fetch("/api/academy-assets/upload", {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? "upload-failed");
      setUploading(false);
      return;
    }

    const body = (await response.json()) as {
      storageKey: string;
      url: string;
    };
    setUpiQrStorageKey(body.storageKey);
    setUpiQrUrl(body.url);
    setUploading(false);
  }

  async function save() {
    setSubmitting(true);
    setError(null);
    setSaved(false);

    const response = await fetch("/api/conversion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        upiQrStorageKey,
        isOnlineRegistrationAllowed,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? "Could not save the conversion page.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="checkbox mt-0.5"
          checked={isOnlineRegistrationAllowed}
          onChange={(event) =>
            setIsOnlineRegistrationAllowed(event.target.checked)
          }
          aria-label="Online Registration"
        />
        <span>
          <span className="font-medium">Online Registration</span>
          <span className="text-base-content/70 mt-1 block text-sm">
            When this is off, visitors cannot submit a Registration. Open
            Batches stay open.
          </span>
        </span>
      </label>

      <p className="text-base-content/70 text-sm">
        Upload the UPI QR visitors see on your conversion page when intake is
        open.
      </p>

      {upiQrUrl ? (
        <img
          src={upiQrUrl}
          alt="UPI QR preview"
          className="h-48 w-48 rounded-box object-contain"
        />
      ) : null}

      <label className="btn btn-ghost btn-sm self-start">
        {upiQrStorageKey ? "Replace UPI QR" : "Upload UPI QR"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void uploadUpiQr(file);
            }
            event.target.value = "";
          }}
        />
      </label>

      {upiQrStorageKey ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm self-start"
          onClick={() => {
            setUpiQrStorageKey(null);
            setUpiQrUrl(null);
          }}
        >
          Remove UPI QR
        </button>
      ) : null}

      {error ? <p className="text-error text-sm">{errorCopy(error)}</p> : null}
      {saved ? <p className="text-success text-sm">Conversion page saved.</p> : null}

      <button
        type="button"
        className="btn btn-neutral"
        disabled={submitting || uploading}
        onClick={() => void save()}
      >
        {submitting ? "Saving…" : "Save conversion page"}
      </button>
    </div>
  );
}
