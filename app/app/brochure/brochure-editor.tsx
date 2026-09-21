"use client";

import { useMemo, useState } from "react";
import type { BrochureEditorState } from "@/lib/brochure";
import { BrochureView } from "@/app/a/[academySlug]/brochure-view";
import { MAX_BROCHURE_GALLERY_IMAGES } from "@/lib/constants";
import { PHONE_INVALID_COPY } from "@/lib/phone";
import { parseYoutubeVideoId } from "@/lib/youtube";
import type { PublicBrochure } from "@/lib/public-brochure";
import Link from "next/link";

type BrochureEditorProps = {
  brochure: BrochureEditorState;
};

type GalleryImage = {
  storageKey: string;
  url: string | null;
};

type CoachDraft = {
  fullName: string;
  imageStorageKey: string | null;
  imageUrl: string | null;
  blurb: string;
};

function errorCopy(error: string | null): string | null {
  switch (error) {
    case "invalid-phone":
      return PHONE_INVALID_COPY;
    case "invalid-storage-key":
      return "Images must belong to your Academy.";
    case "invalid-youtube-url":
      return "Use a YouTube watch, share, or embed URL.";
    case "invalid-input":
      return "Academy name is required.";
    case "gallery-limit":
      return `You can upload up to ${MAX_BROCHURE_GALLERY_IMAGES} gallery images.`;
    case "invalid-type":
      return "Images must be JPEG, PNG, or WebP.";
    case "file-too-large":
      return "Images must be 2 MB or smaller.";
    default:
      return error;
  }
}

async function uploadImage(
  file: File,
  purpose: "brochure-gallery" | "coach-photo",
  draftGalleryCount?: number,
): Promise<{ storageKey: string; url: string }> {
  const form = new FormData();
  form.set("purpose", purpose);
  form.set("file", file);
  if (purpose === "brochure-gallery" && draftGalleryCount !== undefined) {
    form.set("draftGalleryCount", String(draftGalleryCount));
  }

  const response = await fetch("/api/academy-assets/upload", {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "upload-failed");
  }

  return (await response.json()) as { storageKey: string; url: string };
}

export function BrochureEditor({ brochure }: BrochureEditorProps) {
  const [name, setName] = useState(brochure.name);
  const [tagline, setTagline] = useState(brochure.tagline ?? "");
  const [location, setLocation] = useState(brochure.location ?? "");
  const [phone, setPhone] = useState(brochure.phone ?? "");
  const [images, setImages] = useState<GalleryImage[]>(brochure.images);
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
        imageStorageKey: coach.imageStorageKey,
        imageUrl: coach.imageUrl,
        blurb: coach.blurb ?? "",
      }))
      : [{ fullName: "", imageStorageKey: null, imageUrl: null, blurb: "" }],
  );
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const preview: PublicBrochure = useMemo(
    () => ({
      name: name.trim() || brochure.name,
      slug: brochure.slug,
      tagline: tagline.trim() || null,
      location: location.trim() || null,
      phone: phone.trim() || null,
      isIntakeAvailable: brochure.isIntakeAvailable,
      images: images
        .map((image) => image.url)
        .filter((url): url is string => Boolean(url))
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
          imageUrl: coach.imageUrl,
          blurb: coach.blurb.trim() || null,
        })),
    }),
    [
      name,
      tagline,
      location,
      phone,
      images,
      youtubeUrls,
      batchBlurbs,
      coaches,
      brochure.name,
      brochure.slug,
      brochure.batches,
      brochure.isIntakeAvailable,
    ],
  );

  async function addGalleryImage(file: File) {
    if (images.length >= MAX_BROCHURE_GALLERY_IMAGES) {
      setError("gallery-limit");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadImage(file, "brochure-gallery", images.length);
      setImages((current) => [
        ...current,
        { storageKey: uploaded.storageKey, url: uploaded.url },
      ]);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "upload-failed",
      );
    } finally {
      setUploading(false);
    }
  }

  async function setCoachImage(index: number, file: File) {
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadImage(file, "coach-photo");
      setCoaches((current) => {
        const next = [...current];
        next[index] = {
          ...next[index],
          imageStorageKey: uploaded.storageKey,
          imageUrl: uploaded.url,
        };
        return next;
      });
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "upload-failed",
      );
    } finally {
      setUploading(false);
    }
  }

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
        imageStorageKeys: images.map((image) => image.storageKey),
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
      <div className="flex max-w-lg flex-col gap-6">
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
          <span className="label-text mb-1">Details</span>
          <textarea
            className="textarea textarea-bordered w-full"
            name="tagline"
            rows={8}
            value={tagline}
            onChange={(event) => setTagline(event.target.value)}
          />
        </label>
        <label className="form-control w-full">
          <span className="label-text mb-1">Location</span>
          <p className="text-base-content/70 mb-1 text-sm">
            A place name or a map link.
          </p>
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
          <legend className="font-medium">Gallery images</legend>
          {images.map((image) => (
            <div key={image.storageKey} className="flex flex-col gap-2">
              {image.url ? (
                <img
                  src={image.url}
                  alt=""
                  className="h-32 w-full rounded-box object-cover"
                />
              ) : null}
              <button
                type="button"
                className="btn btn-ghost btn-sm self-start"
                onClick={() =>
                  setImages((current) =>
                    current.filter((item) => item.storageKey !== image.storageKey),
                  )
                }
              >
                Remove image
              </button>
            </div>
          ))}
          {images.length < MAX_BROCHURE_GALLERY_IMAGES ? (
            <label className="btn btn-neutral btn-sm self-start">
              {uploading ? "Uploading…" : "Add image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void addGalleryImage(file);
                  }
                  event.target.value = "";
                }}
              />
            </label>
          ) : null}
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
          <legend className="font-medium">Batch Details</legend>
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
              {coach.imageUrl ? (
                <img
                  src={coach.imageUrl}
                  alt=""
                  className="h-24 w-24 rounded-box object-cover"
                />
              ) : null}
              <div className="flex flex-wrap gap-2">
                <label className="btn btn-neutral btn-sm">
                  {coach.imageStorageKey ? "Replace photo" : "Upload photo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void setCoachImage(index, file);
                      }
                      event.target.value = "";
                    }}
                  />
                </label>
                {coach.imageStorageKey ? (
                  <button
                    type="button"
                    className="btn btn-neutral btn-sm"
                    onClick={() => {
                      setCoaches((current) => {
                        const next = [...current];
                        next[index] = {
                          ...next[index],
                          imageStorageKey: null,
                          imageUrl: null,
                        };
                        return next;
                      });
                    }}
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
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
            className="btn btn-neutral btn-sm self-start"
            onClick={() =>
              setCoaches((current) => [
                ...current,
                {
                  fullName: "",
                  imageStorageKey: null,
                  imageUrl: null,
                  blurb: "",
                },
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
          disabled={submitting || uploading}
          onClick={() => void save()}
        >
          {submitting ? "Saving…" : "Save brochure"}
        </button>

        <Link
          href={`/a/${brochure.slug}`}
          className="btn btn-neutral"
          target="_blank"
          rel="noopener noreferrer">Visit Page</Link>


      </div>

      <section className="border-base-300 relative overflow-hidden rounded-box border p-2">
        <h2 className="px-4 pt-4 text-lg font-semibold">Preview</h2>
        <BrochureView brochure={preview} ctaPlacement="frame" />
      </section>
    </div>
  );
}
