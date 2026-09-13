"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type LoginFormProps = {
  callbackUrl: string;
};

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const formLocked = status === "sending" || status === "sent";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    const displayName = email.split("@")[0] || "Owner";

    const { error } = await authClient.signIn.magicLink({
      email,
      name: displayName,
      callbackURL: callbackUrl,
      errorCallbackURL: "/login?error=link",
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message ?? "Could not send the magic link.");
      return;
    }

    setStatus("sent");
  }

  return (
    <form className="space-y-4 flex flex-col gap-2" onSubmit={handleSubmit}>
      <label className="form-control w-full">
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="input input-bordered w-full"
          placeholder="you@academy.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={formLocked}
        />
      </label>

      {status === "sent" ? (
        <p className="text-success text-sm">
          Check your email for a sign-in link. It expires in 15 minutes.
        </p>
      ) : null}

      {status === "error" && errorMessage ? (
        <p className="text-error text-sm">{errorMessage}</p>
      ) : null}

      <button
        type="submit"
        className="btn btn-neutral w-full"
        disabled={formLocked}
      >
        {status === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
