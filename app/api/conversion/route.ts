import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { updateConversion } from "@/lib/conversion";
import { revalidatePublicAcademyPages } from "@/lib/public-academy-pages";

type ConversionBody = {
  upiQrStorageKey?: string | null;
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

  const body = (await request.json()) as ConversionBody;
  const result = await updateConversion(academy.id, {
    upiQrStorageKey: body.upiQrStorageKey ?? null,
  });

  if (!result.ok) {
    const status =
      result.error === "not-found"
        ? 404
        : result.error === "invalid-storage-key"
          ? 403
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  revalidatePublicAcademyPages(academy.slug);

  return NextResponse.json({ ok: true });
}
