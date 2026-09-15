"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isAcademySlug, suggestAcademySlug } from "@/lib/academy-slug";
import { SLUG_HELP } from "@/lib/constants";

export function CreateAcademyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [pendingOwnerEmail, setPendingOwnerEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedSlug = slugTouched ? slug : slug || suggestAcademySlug(name);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/admin/academies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        slug: resolvedSlug,
        pendingOwnerEmail,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? "Could not create Academy.");
      setSubmitting(false);
      return;
    }

    setName("");
    setSlug("");
    setSlugTouched(false);
    setPendingOwnerEmail("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form className="flex max-w-lg flex-col gap-3" onSubmit={onSubmit}>
      <label className="flex flex-col gap-1 text-sm">
        Academy name
        <input
          className="input input-bordered"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Slug
        <input
          className="input input-bordered font-mono"
          value={resolvedSlug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
          required
        />
        <span className="text-base-content/60 text-xs">{SLUG_HELP}</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Owner email to claim
        <input
          className="input input-bordered"
          type="email"
          value={pendingOwnerEmail}
          onChange={(event) => setPendingOwnerEmail(event.target.value)}
          required
        />
      </label>
      {error ? <p className="text-error text-sm">{error}</p> : null}
      <button
        type="submit"
        className="btn btn-primary self-start"
        disabled={
          submitting ||
          !name.trim() ||
          !pendingOwnerEmail.trim() ||
          !isAcademySlug(resolvedSlug)
        }
      >
        {submitting ? "Creating…" : "Create Academy"}
      </button>
    </form>
  );
}
