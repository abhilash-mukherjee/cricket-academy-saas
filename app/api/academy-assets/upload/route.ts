import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  type AcademyAssetPurpose,
  uploadAcademyAsset,
} from "@/lib/academy-assets";
import { countBrochureGalleryImages } from "@/lib/brochure";
import { getOwnedAcademy } from "@/lib/owner-onboarding";

const purposes: AcademyAssetPurpose[] = [
  "brochure-gallery",
  "coach-photo",
  "upi-qr",
];

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session.user.isSuperAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const academy = await getOwnedAcademy(session.user.id);
  if (!academy) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
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
    existingGalleryCount = await countBrochureGalleryImages(academy.id);
    if (typeof draftGalleryCountRaw === "string" && draftGalleryCountRaw) {
      const parsed = Number.parseInt(draftGalleryCountRaw, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        draftGalleryCount = parsed;
      }
    }
  }

  const result = await uploadAcademyAsset(
    academy.id,
    purpose as AcademyAssetPurpose,
    file,
    { existingGalleryCount, draftGalleryCount },
  );

  if (!result.ok) {
    const status = result.error === "gallery-limit" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    storageKey: result.storageKey,
    url: result.url,
  });
}
