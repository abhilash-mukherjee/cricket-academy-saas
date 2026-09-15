import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { updateBrochure } from "@/lib/brochure";
import { revalidatePublicAcademyPages } from "@/lib/public-academy-pages";

type BrochureBody = {
  name?: string;
  tagline?: string | null;
  location?: string | null;
  phone?: string | null;
  imageStorageKeys?: string[];
  youtubeUrls?: string[];
  batchBlurbs?: { id: string; blurb: string }[];
  coaches?: {
    fullName: string;
    imageStorageKey?: string | null;
    blurb?: string | null;
  }[];
};

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

  const body = (await request.json()) as BrochureBody;
  const result = await updateBrochure(academy.id, {
    name: String(body.name ?? ""),
    tagline: String(body.tagline ?? ""),
    location: String(body.location ?? ""),
    phone: String(body.phone ?? ""),
    imageStorageKeys: body.imageStorageKeys,
    youtubeUrls: body.youtubeUrls,
    batchBlurbs: body.batchBlurbs,
    coaches: body.coaches,
  });

  if (!result.ok) {
    const status =
      result.error === "not-found"
        ? 404
        : result.error === "invalid-storage-key"
          ? 403
          : result.error === "gallery-limit"
            ? 409
            : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  revalidatePublicAcademyPages(academy.slug);

  return NextResponse.json({ ok: true });
}
