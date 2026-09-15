import { NextResponse } from "next/server";
import {
  createAdminAcademy,
  listAdminAcademies,
} from "@/lib/admin-academies";
import { requireSuperAdminSession } from "@/lib/require-super-admin";

export async function GET(request: Request) {
  const gate = await requireSuperAdminSession(request);
  if (gate.error) {
    return gate.error;
  }

  const academies = await listAdminAcademies();
  return NextResponse.json({ academies });
}

export async function POST(request: Request) {
  const gate = await requireSuperAdminSession(request);
  if (gate.error) {
    return gate.error;
  }

  const body = (await request.json()) as {
    name?: string;
    slug?: string;
    pendingOwnerEmail?: string;
  };

  const result = await createAdminAcademy({
    name: String(body.name ?? ""),
    slug: String(body.slug ?? ""),
    pendingOwnerEmail: String(body.pendingOwnerEmail ?? ""),
  });

  if (!result.ok) {
    const status = result.error === "slug-taken" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ id: result.id, slug: result.slug });
}
