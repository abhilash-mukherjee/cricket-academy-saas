"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isAcademySlug, suggestAcademySlug } from "@/lib/academy-slug";
import { SLUG_HELP } from "@/lib/constants";
import { onboardingSubmitSucceeded } from "@/lib/onboarding-submit";

const STEPS = ["You", "Academy", "Batch", "Brochure"] as const;

type WizardValues = {
  displayName: string;
  academyName: string;
  slug: string;
  batchName: string;
  tagline: string;
  location: string;
  phone: string;
};

const INITIAL_VALUES: WizardValues = {
  displayName: "",
  academyName: "",
  slug: "",
  batchName: "",
  tagline: "",
  location: "",
  phone: "",
};

function errorCopy(error: string | null): string | null {
  switch (error) {
    case "invalid-slug":
      return "Use lowercase letters, numbers, and hyphens only.";
    case "slug-taken":
      return "That slug is already taken. Pick another.";
    case "already-owns-academy":
      return "This login already owns an Academy.";
    case "invalid-phone":
      return "Phone must be E.164, for example +919876543210.";
    case "invalid-input":
      return "Fill in the required fields to continue.";
    default:
      return error;
  }
}

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(INITIAL_VALUES);
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = slugTouched
    ? values.slug
    : values.slug || suggestAcademySlug(values.academyName);

  const canAdvance = useMemo(() => {
    if (step === 0) return values.displayName.trim().length > 0;
    if (step === 1) {
      return values.academyName.trim().length > 0 && isAcademySlug(slug);
    }
    if (step === 2) return values.batchName.trim().length > 0;
    return true;
  }, [step, values, slug]);

  function update<K extends keyof WizardValues>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(skipBrochure: boolean) {
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: values.displayName,
        academyName: values.academyName,
        slug,
        batchName: values.batchName,
        tagline: skipBrochure ? "" : values.tagline,
        location: skipBrochure ? "" : values.location,
        phone: skipBrochure ? "" : values.phone,
      }),
    });

    if (onboardingSubmitSucceeded(response)) {
      router.push("/app/dashboard");
      router.refresh();
      return;
    }

    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    const code = body?.error ?? "Could not finish setup.";
    setSubmitting(false);
    setError(code);
    if (code === "invalid-slug" || code === "slug-taken") {
      setStep(1);
    }
    if (code === "already-owns-academy") {
      router.push("/app/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="steps steps-horizontal w-full text-xs">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`step ${index <= step ? "step-primary" : ""}`}
          >
            {label}
          </li>
        ))}
      </ul>

      {step === 0 ? (
        <label className="form-control w-full">
          <span className="label-text mb-1">Your display name</span>
          <input
            className="input input-bordered w-full"
            name="displayName"
            autoComplete="name"
            value={values.displayName}
            onChange={(event) => update("displayName", event.target.value)}
          />
        </label>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <label className="form-control w-full">
            <span className="label-text mb-1">Academy name</span>
            <input
              className="input input-bordered w-full"
              name="academyName"
              value={values.academyName}
              onChange={(event) => update("academyName", event.target.value)}
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-1">Public slug</span>
            <input
              className="input input-bordered w-full"
              name="slug"
              value={slug}
              onChange={(event) => {
                setSlugTouched(true);
                update("slug", event.target.value.toLowerCase());
              }}
            />
            <span className="label-text-alt mt-1">{SLUG_HELP}</span>
          </label>
        </div>
      ) : null}

      {step === 2 ? (
        <label className="form-control w-full">
          <span className="label-text mb-1">First Batch name</span>
          <input
            className="input input-bordered w-full"
            name="batchName"
            placeholder="U-14 evening"
            value={values.batchName}
            onChange={(event) => update("batchName", event.target.value)}
          />
        </label>
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col gap-4">
          <p className="text-base-content/70 text-sm">
            Brochure basics are optional. You can skip them and finish.
          </p>
          <label className="form-control w-full">
            <span className="label-text mb-1">Tagline</span>
            <textarea
              className="textarea textarea-bordered w-full"
              name="tagline"
              rows={3}
              value={values.tagline}
              onChange={(event) => update("tagline", event.target.value)}
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-1">Location</span>
            <input
              className="input input-bordered w-full"
              name="location"
              value={values.location}
              onChange={(event) => update("location", event.target.value)}
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-1">Phone</span>
            <input
              className="input input-bordered w-full"
              name="phone"
              placeholder="+919876543210"
              value={values.phone}
              onChange={(event) => update("phone", event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {error ? (
        <p className="text-error text-sm">{errorCopy(error)}</p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {step > 0 ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={submitting}
            onClick={() => setStep((current) => current - 1)}
          >
            Back
          </button>
        ) : null}

        {step < 3 ? (
          <button
            type="button"
            className="btn btn-neutral"
            disabled={!canAdvance}
            onClick={() => setStep((current) => current + 1)}
          >
            Continue
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={submitting}
              onClick={() => void submit(true)}
            >
              Skip for now
            </button>
            <button
              type="button"
              className="btn btn-neutral"
              disabled={submitting}
              onClick={() => void submit(false)}
            >
              {submitting ? "Saving…" : "Finish setup"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
