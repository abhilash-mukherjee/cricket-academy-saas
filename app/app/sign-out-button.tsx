"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const SIGN_OUT_ERROR = "Could not sign out. Try again.";

export function SignOutButton() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    setErrorMessage(null);

    try {
      const { error } = await authClient.signOut();
      if (error) {
        setErrorMessage(error.message ?? SIGN_OUT_ERROR);
        setPending(false);
        return;
      }

      // Full navigation after client sign-out; avoids useRouter (breaks SSR tests).
      window.location.assign("/login"); // eslint-disable-line @next/next/no-location-assign-relative-destination
    } catch {
      setErrorMessage(SIGN_OUT_ERROR);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className="btn btn-ghost btn-sm w-full justify-start"
        disabled={pending}
        onClick={() => void handleSignOut()}
      >
        Sign out
      </button>
      {errorMessage ? (
        <p className="text-error text-sm">{errorMessage}</p>
      ) : null}
    </div>
  );
}
