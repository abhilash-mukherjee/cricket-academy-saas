import { NextResponse } from "next/server";
import {
  recordOwnerWriteIfImpersonating,
  resolveOwnerContext,
} from "@/lib/owner-context";
import { updateConversion } from "@/lib/conversion";
import { revalidatePublicAcademyPages } from "@/lib/public-academy-pages";

type ConversionBody = {
  upiQrStorageKey?: string | null;
  isOnlineRegistrationAllowed?: boolean;
};

export async function POST(request: Request) {
  const context = await resolveOwnerContext(request.headers);
  if (!context.ok) {
    if (context.error === "unauthorized") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const status = context.error === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: context.error }, { status });
  }

  const body = (await request.json()) as ConversionBody;
  const result = await updateConversion(context.academy.id, {
    ...("upiQrStorageKey" in body
      ? { upiQrStorageKey: body.upiQrStorageKey ?? null }
      : {}),
    ...("isOnlineRegistrationAllowed" in body
      ? { isOnlineRegistrationAllowed: body.isOnlineRegistrationAllowed }
      : {}),
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

  await recordOwnerWriteIfImpersonating(context, "conversion.update");
  revalidatePublicAcademyPages(context.academy.slug);

  return NextResponse.json({ ok: true });
}
