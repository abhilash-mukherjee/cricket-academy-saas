import { NextResponse } from "next/server";
import {
  recordOwnerWriteIfImpersonating,
  resolveOwnerContext,
} from "@/lib/owner-context";
import {
  brochureAppearanceInputSchema,
  brochureSocialInputSchema,
  updateBrochure,
} from "@/lib/brochure";
import { revalidatePublicAcademyPages } from "@/lib/public-academy-pages";

type BrochureBody = {
  name?: string;
  tagline?: string | null;
  aboutLabel?: unknown;
  about?: unknown;
  logoStorageKey?: unknown;
  themeMode?: unknown;
  themeAccent?: unknown;
  location?: string | null;
  phone?: string | null;
  instagram?: unknown;
  whatsapp?: unknown;
  imageStorageKeys?: string[];
  youtubeUrls?: string[];
  batchBlurbs?: { id: string; blurb: string }[];
  coaches?: {
    fullName: string;
    imageStorageKey?: string | null;
    blurb?: string | null;
  }[];
};

const brochureOptionalInputSchema = brochureAppearanceInputSchema.extend(
  brochureSocialInputSchema.shape,
);

const OPTIONAL_INPUT_KEYS = [
  "aboutLabel",
  "about",
  "logoStorageKey",
  "themeMode",
  "themeAccent",
  "instagram",
  "whatsapp",
] as const;

export async function POST(request: Request) {
  const context = await resolveOwnerContext(request.headers);
  if (!context.ok) {
    if (context.error === "unauthorized") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const status = context.error === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: context.error }, { status });
  }

  const rawBody = (await request.json()) as unknown;
  const body: BrochureBody =
    rawBody && typeof rawBody === "object" ? (rawBody as BrochureBody) : {};

  const rawOptionalInput: Record<string, unknown> = {};
  for (const key of OPTIONAL_INPUT_KEYS) {
    if (Object.hasOwn(body, key)) {
      rawOptionalInput[key] = body[key];
    }
  }
  const parsedOptional =
    brochureOptionalInputSchema.safeParse(rawOptionalInput);
  if (!parsedOptional.success) {
    return NextResponse.json({ error: "invalid-input" }, { status: 400 });
  }

  const result = await updateBrochure(context.academy.id, {
    name: String(body.name ?? ""),
    tagline: String(body.tagline ?? ""),
    location: String(body.location ?? ""),
    phone: String(body.phone ?? ""),
    ...parsedOptional.data,
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

  await recordOwnerWriteIfImpersonating(context, "brochure.update");
  revalidatePublicAcademyPages(context.academy.slug);

  return NextResponse.json({ ok: true });
}
