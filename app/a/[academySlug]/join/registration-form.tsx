"use client";

import { useMemo, useState } from "react";
import type {
  RegistrableBatch,
  RegistrableFeeOption,
} from "@/lib/academy-intake";
import { packageFactsCopy } from "@/lib/package-copy";
import {
  isFutureDateOfBirth,
  isPlayerUnder18,
  isValidCalendarDate,
} from "@/lib/player-age";
import {
  EMAIL_INVALID_COPY,
  PACKAGE_REQUIRED_COPY,
  parseRegistrationInput,
  type RegistrationFieldErrors,
} from "@/lib/registration-input";
import type { RegistrationSnapshot } from "@/lib/registrations";
import { RegistrationThankYou } from "./registration-thank-you";
import { UpiPayQr } from "./upi-pay-qr";

type RegistrationFormProps = {
  academySlug: string;
  batches: RegistrableBatch[];
  upiQrUrl: string | null;
};

type FormValues = {
  batchFeeOptionId: string;
  playerFullName: string;
  playerDateOfBirth: string;
  guardianFullName: string;
  guardianPhone: string;
  playerPhone: string;
  contactEmail: string;
  note: string;
};

function preselectedFeeOptionId(batches: RegistrableBatch[]): string {
  const options = batches.flatMap((batch) => batch.feeOptions);
  return options.length === 1 ? options[0].id : "";
}

function emptyValues(batches: RegistrableBatch[]): FormValues {
  return {
    batchFeeOptionId: preselectedFeeOptionId(batches),
    playerFullName: "",
    playerDateOfBirth: "",
    guardianFullName: "",
    guardianPhone: "",
    playerPhone: "",
    contactEmail: "",
    note: "",
  };
}

function selectedOption(
  batches: RegistrableBatch[],
  feeOptionId: string,
): { batch: RegistrableBatch; option: RegistrableFeeOption } | null {
  for (const batch of batches) {
    const option = batch.feeOptions.find((item) => item.id === feeOptionId);
    if (option) {
      return { batch, option };
    }
  }
  return null;
}

function errorCopy(error: string | null): string | null {
  switch (error) {
    case "duplicate-pending":
      return "A Registration for this Player and Batch is already pending. The Academy will contact you on this phone.";
    case "intake-unavailable":
      return "That package is no longer offered. Reload to see current Batches.";
    case "invalid-input":
      return null;
    default:
      return error;
  }
}

export function RegistrationForm({
  academySlug,
  batches,
  upiQrUrl,
}: RegistrationFormProps) {
  const [values, setValues] = useState(() => emptyValues(batches));
  const [fields, setFields] = useState<RegistrationFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [snapshot, setSnapshot] = useState<RegistrationSnapshot | null>(null);

  const dobIsValidPast =
    isValidCalendarDate(values.playerDateOfBirth) &&
    !isFutureDateOfBirth(values.playerDateOfBirth);
  const under18 = dobIsValidPast
    ? isPlayerUnder18(values.playerDateOfBirth)
    : null;
  const selected = selectedOption(batches, values.batchFeeOptionId);

  const payload = useMemo(() => {
    const body: Record<string, string> = {
      batchFeeOptionId: values.batchFeeOptionId,
      playerFullName: values.playerFullName,
      playerDateOfBirth: values.playerDateOfBirth,
      contactEmail: values.contactEmail,
      note: values.note,
    };
    if (selected) {
      body.batchId = selected.batch.id;
    }
    if (under18 === true) {
      body.guardianFullName = values.guardianFullName;
      body.guardianPhone = values.guardianPhone;
    }
    if (under18 === false) {
      body.playerPhone = values.playerPhone;
    }
    return body;
  }, [values, selected, under18]);

  const parsed = parseRegistrationInput(payload);
  const lastStepReady = parsed.ok;
  const showPay = lastStepReady && Boolean(upiQrUrl) && selected;

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => {
      if (key === "playerDateOfBirth") {
        return {
          ...current,
          playerDateOfBirth: value,
          guardianFullName: "",
          guardianPhone: "",
          playerPhone: "",
        };
      }
      return { ...current, [key]: value };
    });
    setFields((current) => {
      const next = { ...current };
      delete next[key as keyof RegistrationFieldErrors];
      if (key === "playerDateOfBirth") {
        delete next.guardianFullName;
        delete next.guardianPhone;
        delete next.playerPhone;
      }
      return next;
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = parseRegistrationInput(payload);
    if (!next.ok) {
      setFields(next.fields);
      if (next.fields.batchFeeOptionId) {
        setFormError(null);
      }
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFields({});

    const response = await fetch(`/api/a/${academySlug}/registrations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next.value),
    });

    if (response.status === 404) {
      window.location.assign(`/a/${academySlug}/join`);
      return;
    }

    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      snapshot?: RegistrationSnapshot;
      error?: string;
    } | null;

    if (response.ok && body?.ok && body.snapshot) {
      setSnapshot(body.snapshot);
      setSubmitting(false);
      return;
    }

    if (body?.error === "invalid-input") {
      const again = parseRegistrationInput(payload);
      if (!again.ok) {
        setFields(again.fields);
      }
    }
    setFormError(body?.error ?? "invalid-input");
    setSubmitting(false);
  }

  if (snapshot) {
    return (
      <RegistrationThankYou
        snapshot={snapshot}
        upiQrUrl={upiQrUrl}
        onRegisterAnother={() => {
          setSnapshot(null);
          setValues(emptyValues(batches));
          setFields({});
          setFormError(null);
        }}
      />
    );
  }

  const formMessage = errorCopy(formError);
  const showReload = formError === "intake-unavailable";

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <p>Register for a Batch.</p>

      <div role="radiogroup" aria-label="Packages" className="flex flex-col gap-4">
        {batches.map((batch) => (
          <section
            key={batch.id || batch.name}
            className="flex flex-col gap-3"
          >
            <h2 className="text-xl font-semibold">{batch.name}</h2>
            <div className="flex flex-col gap-2">
              {batch.feeOptions.map((option) => (
                <label
                  key={
                    option.id ||
                    `${batch.id || batch.name}-${option.daysPerWeek}-${option.termDays}`
                  }
                  className="card bg-base-200 cursor-pointer"
                >
                  <div className="card-body flex-row items-start gap-3 py-3">
                    <input
                      type="radio"
                      className="radio mt-1"
                      name="batchFeeOptionId"
                      value={option.id}
                      checked={values.batchFeeOptionId === option.id}
                      onChange={() => update("batchFeeOptionId", option.id)}
                    />
                    <div className="flex flex-col gap-1">
                      {option.label ? (
                        <p className="font-medium">{option.label}</p>
                      ) : null}
                      <p>{packageFactsCopy(option)}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
      {fields.batchFeeOptionId ? (
        <p className="text-error text-sm">{PACKAGE_REQUIRED_COPY}</p>
      ) : null}

      <label className="form-control w-full">
        <span className="label-text mb-1">Player full name</span>
        <input
          className="input input-bordered w-full"
          name="playerFullName"
          autoComplete="name"
          value={values.playerFullName}
          onChange={(event) => update("playerFullName", event.target.value)}
        />
        {fields.playerFullName ? (
          <span className="text-error text-sm mt-1">{fields.playerFullName}</span>
        ) : null}
      </label>

      <label className="form-control w-full">
        <span className="label-text mb-1">Date of birth</span>
        <input
          className="input input-bordered w-full"
          type="date"
          name="playerDateOfBirth"
          value={values.playerDateOfBirth}
          onChange={(event) => update("playerDateOfBirth", event.target.value)}
        />
        {fields.playerDateOfBirth ? (
          <span className="text-error text-sm mt-1">
            {fields.playerDateOfBirth}
          </span>
        ) : null}
      </label>

      {dobIsValidPast && under18 === true ? (
        <>
          <label className="form-control w-full">
            <span className="label-text mb-1">Guardian full name</span>
            <input
              className="input input-bordered w-full"
              name="guardianFullName"
              value={values.guardianFullName}
              onChange={(event) =>
                update("guardianFullName", event.target.value)
              }
            />
            {fields.guardianFullName ? (
              <span className="text-error text-sm mt-1">
                {fields.guardianFullName}
              </span>
            ) : null}
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-1">Guardian phone</span>
            <input
              className="input input-bordered w-full"
              name="guardianPhone"
              placeholder="+919876543210"
              value={values.guardianPhone}
              onChange={(event) => update("guardianPhone", event.target.value)}
            />
            {fields.guardianPhone ? (
              <span className="text-error text-sm mt-1">
                {fields.guardianPhone}
              </span>
            ) : null}
          </label>
        </>
      ) : null}

      {dobIsValidPast && under18 === false ? (
        <label className="form-control w-full">
          <span className="label-text mb-1">Player phone</span>
          <input
            className="input input-bordered w-full"
            name="playerPhone"
            placeholder="+919876543210"
            value={values.playerPhone}
            onChange={(event) => update("playerPhone", event.target.value)}
          />
          {fields.playerPhone ? (
            <span className="text-error text-sm mt-1">{fields.playerPhone}</span>
          ) : null}
        </label>
      ) : null}

      {dobIsValidPast ? (
        <label className="form-control w-full">
          <span className="label-text mb-1">Email (optional)</span>
          <input
            className="input input-bordered w-full"
            type="email"
            name="contactEmail"
            autoComplete="email"
            value={values.contactEmail}
            onChange={(event) => update("contactEmail", event.target.value)}
          />
          {fields.contactEmail ? (
            <span className="text-error text-sm mt-1">{EMAIL_INVALID_COPY}</span>
          ) : null}
        </label>
      ) : null}

      <label className="form-control w-full">
        <span className="label-text mb-1">Note (optional)</span>
        <textarea
          className="textarea textarea-bordered w-full"
          name="note"
          rows={3}
          value={values.note}
          onChange={(event) => update("note", event.target.value)}
        />
        {fields.note ? (
          <span className="text-error text-sm mt-1">{fields.note}</span>
        ) : null}
      </label>

      {showPay && selected && upiQrUrl ? (
        <UpiPayQr feePaise={selected.option.feePaise} upiQrUrl={upiQrUrl} />
      ) : null}

      {formMessage ? <p className="text-error text-sm">{formMessage}</p> : null}
      {showReload ? (
        <a className="btn btn-ghost" href={`/a/${academySlug}/join`}>
          Reload
        </a>
      ) : null}

      <button
        type="submit"
        className="btn btn-neutral"
        disabled={submitting}
      >
        Submit Registration
      </button>
    </form>
  );
}
