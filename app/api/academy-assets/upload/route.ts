import { NextResponse } from "next/server";
import {
  type AcademyAssetPurpose,
  uploadAcademyAsset,
} from "@/lib/academy-assets";
import { countBrochureGalleryImages } from "@/lib/brochure";
import {
  recordOwnerWriteIfImpersonating,
  resolveOwnerContext,
} from "@/lib/owner-context";

const purposes: AcademyAssetPurpose[] = [
  "brochure-gallery",
  "coach-photo",
  "upi-qr",
];

export async function POST(request: Request) {
  const context = await resolveOwnerContext(request.headers);
  if (!context.ok) {
    if (context.error === "unauthorized") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const status = context.error === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: context.error }, { status });
  }

  const form = await request.formData();
  const purpose = form.get("purpose");
  const file = form.get("file");
  const draftGalleryCountRaw = form.get("draftGalleryCount");

  if (
    typeof purpose !== "string" ||
    !purposes.includes(purpose as AcademyAssetPurpose) ||
    !(file instanceof File)
  ) {
    return NextResponse.json({ error: "invalid-input" }, { status: 400 });
  }

  let existingGalleryCount = 0;
  let draftGalleryCount = 0;
  if (purpose === "brochure-gallery") {
    existingGalleryCount = await countBrochureGalleryImages(context.academy.id);
    if (typeof draftGalleryCountRaw === "string" && draftGalleryCountRaw) {
      const parsed = Number.parseInt(draftGalleryCountRaw, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        draftGalleryCount = parsed;
      }
    }
  }

  const result = await uploadAcademyAsset(
    context.academy.id,
    purpose as AcademyAssetPurpose,
    file,
    { existingGalleryCount, draftGalleryCount },
  );

  if (!result.ok) {
    const status = result.error === "gallery-limit" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  await recordOwnerWriteIfImpersonating(context, "academy-asset.upload", {
    purpose,
  });

  return NextResponse.json({
    storageKey: result.storageKey,
    url: result.url,
  });
}
