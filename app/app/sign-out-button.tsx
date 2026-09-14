"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const SIGN_OUT_ERROR = "Could not sign out. Try again.";

export function SignOutButton() {
  const router = useRouter();
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

      router.replace("/login");
    } catch {
      setErrorMessage(SIGN_OUT_ERROR);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
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
