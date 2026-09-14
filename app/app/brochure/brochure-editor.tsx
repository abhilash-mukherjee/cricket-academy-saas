"use client";

import { useMemo, useState } from "react";
import type { BrochureEditorState } from "@/lib/brochure";
import { BrochureView } from "@/app/a/[academySlug]/brochure-view";
import { parseYoutubeVideoId } from "@/lib/youtube";
import type { PublicBrochure } from "@/lib/public-brochure";

type BrochureEditorProps = {
  brochure: BrochureEditorState;
};

type CoachDraft = {
  fullName: string;
  imageUrl: string;
  blurb: string;
};

function errorCopy(error: string | null): string | null {
  switch (error) {
    case "invalid-phone":
      return "Phone must be E.164, for example +919876543210.";
    case "invalid-image-url":
      return "Images must be http or https URLs.";
    case "invalid-youtube-url":
      return "Use a YouTube watch, share, or embed URL.";
    case "invalid-input":
      return "Academy name is required.";
    default:
      return error;
  }
}

export function BrochureEditor({ brochure }: BrochureEditorProps) {
  const [name, setName] = useState(brochure.name);
  const [tagline, setTagline] = useState(brochure.tagline ?? "");
  const [location, setLocation] = useState(brochure.location ?? "");
  const [phone, setPhone] = useState(brochure.phone ?? "");
  const [imageUrls, setImageUrls] = useState(
    brochure.imageUrls.length > 0 ? brochure.imageUrls : [""],
  );
  const [youtubeUrls, setYoutubeUrls] = useState(
    brochure.youtubeUrls.length > 0 ? brochure.youtubeUrls : [""],
  );
  const [batchBlurbs, setBatchBlurbs] = useState(
    Object.fromEntries(
      brochure.batches.map((batch) => [batch.id, batch.blurb ?? ""]),
    ),
  );
  const [coaches, setCoaches] = useState<CoachDraft[]>(
    brochure.coaches.length > 0
      ? brochure.coaches.map((coach) => ({
          fullName: coach.fullName,
          imageUrl: coach.imageUrl ?? "",
          blurb: coach.blurb ?? "",
        }))
      : [{ fullName: "", imageUrl: "", blurb: "" }],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const preview: PublicBrochure = useMemo(
    () => ({
      name: name.trim() || brochure.name,
      slug: brochure.slug,
      tagline: tagline.trim() || null,
      location: location.trim() || null,
      phone: phone.trim() || null,
      images: imageUrls
        .map((url) => url.trim())
        .filter(Boolean)
        .map((url) => ({ url })),
      youtubeVideoIds: youtubeUrls
        .map((url) => parseYoutubeVideoId(url))
        .filter((id): id is string => Boolean(id)),
      batches: brochure.batches.map((batch) => ({
        name: batch.name,
        blurb: batchBlurbs[batch.id]?.trim() || null,
      })),
      coaches: coaches
        .filter((coach) => coach.fullName.trim())
        .map((coach) => ({
          fullName: coach.fullName.trim(),
          imageUrl: coach.imageUrl.trim() || null,
          blurb: coach.blurb.trim() || null,
        })),
    }),
    [
      name,
      tagline,
      location,
      phone,
      imageUrls,
      youtubeUrls,
      batchBlurbs,
      coaches,
      brochure.name,
      brochure.slug,
      brochure.batches,
    ],
  );

  async function save() {
    setSubmitting(true);
    setError(null);
    setSaved(false);

    const response = await fetch("/api/brochure", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        tagline,
        location,
        phone,
        imageUrls,
        youtubeUrls,
        batchBlurbs: brochure.batches.map((batch) => ({
          id: batch.id,
          blurb: batchBlurbs[batch.id] ?? "",
        })),
        coaches,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? "Could not save the brochure.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <label className="form-control w-full">
        <span className="label-text mb-1">Academy name</span>
        <input
          className="input input-bordered w-full"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="form-control w-full">
        <span className="label-text mb-1">Tagline</span>
        <input
          className="input input-bordered w-full"
          name="tagline"
          value={tagline}
          onChange={(event) => setTagline(event.target.value)}
        />
      </label>
      <label className="form-control w-full">
        <span className="label-text mb-1">Location</span>
        <input
          className="input input-bordered w-full"
          name="location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        />
      </label>
      <label className="form-control w-full">
        <span className="label-text mb-1">Phone</span>
        <input
          className="input input-bordered w-full"
          name="phone"
          placeholder="+919876543210"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-medium">Images</legend>
        {imageUrls.map((url, index) => (
          <input
            key={`image-${index}`}
            className="input input-bordered w-full"
            name={`imageUrl-${index}`}
            placeholder="https://"
            value={url}
            onChange={(event) => {
              const next = [...imageUrls];
              next[index] = event.target.value;
              setImageUrls(next);
            }}
          />
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-sm self-start"
          onClick={() => setImageUrls((current) => [...current, ""])}
        >
          Add image URL
        </button>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-medium">YouTube</legend>
        {youtubeUrls.map((url, index) => (
          <input
            key={`youtube-${index}`}
            className="input input-bordered w-full"
            name={`youtubeUrl-${index}`}
            placeholder="https://www.youtube.com/watch?v="
            value={url}
            onChange={(event) => {
              const next = [...youtubeUrls];
              next[index] = event.target.value;
              setYoutubeUrls(next);
            }}
          />
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-sm self-start"
          onClick={() => setYoutubeUrls((current) => [...current, ""])}
        >
          Add YouTube URL
        </button>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-medium">Batch blurbs</legend>
        {brochure.batches.map((batch) => (
          <label
            key={batch.id}
            className="form-control w-full"
            data-batch-id={batch.id}
          >
            <span className="label-text mb-1">{batch.name}</span>
            <textarea
              className="textarea textarea-bordered w-full"
              name={`batchBlurb-${batch.id}`}
              value={batchBlurbs[batch.id] ?? ""}
              onChange={(event) =>
                setBatchBlurbs((current) => ({
                  ...current,
                  [batch.id]: event.target.value,
                }))
              }
            />
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="font-medium">Coach profiles</legend>
        {coaches.map((coach, index) => (
          <div key={`coach-${index}`} className="flex flex-col gap-2">
            <input
              className="input input-bordered w-full"
              name={`coachName-${index}`}
              placeholder="Name"
              value={coach.fullName}
              onChange={(event) => {
                const next = [...coaches];
                next[index] = { ...coach, fullName: event.target.value };
                setCoaches(next);
              }}
            />
            <input
              className="input input-bordered w-full"
              name={`coachImage-${index}`}
              placeholder="Image URL"
              value={coach.imageUrl}
              onChange={(event) => {
                const next = [...coaches];
                next[index] = { ...coach, imageUrl: event.target.value };
                setCoaches(next);
              }}
            />
            <textarea
              className="textarea textarea-bordered w-full"
              name={`coachBlurb-${index}`}
              placeholder="Optional blurb"
              value={coach.blurb}
              onChange={(event) => {
                const next = [...coaches];
                next[index] = { ...coach, blurb: event.target.value };
                setCoaches(next);
              }}
            />
          </div>
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-sm self-start"
          onClick={() =>
            setCoaches((current) => [
              ...current,
              { fullName: "", imageUrl: "", blurb: "" },
            ])
          }
        >
          Add Coach profile
        </button>
      </fieldset>

      {error ? <p className="text-error text-sm">{errorCopy(error)}</p> : null}
      {saved ? <p className="text-success text-sm">Brochure saved.</p> : null}

      <button
        type="button"
        className="btn btn-neutral"
        disabled={submitting}
        onClick={() => void save()}
      >
        {submitting ? "Saving…" : "Save brochure"}
      </button>

      <section className="border-base-300 rounded-box border p-2">
        <h2 className="px-4 pt-4 text-lg font-semibold">Preview</h2>
        <BrochureView brochure={preview} />
      </section>
    </div>
  );
}
