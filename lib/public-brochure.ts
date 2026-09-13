import { eq } from "drizzle-orm";
import { academies } from "@/db/domain-schema";
import { getDb } from "@/db/client";

export type PublicBrochure = {
  name: string;
  slug: string;
  tagline: string | null;
  location: string | null;
  phone: string | null;
};

export async function getPublicBrochure(
  slug: string,
): Promise<PublicBrochure | null> {
  const db = getDb();
  const [academy] = await db
    .select({
      name: academies.name,
      slug: academies.slug,
      tagline: academies.tagline,
      location: academies.location,
      phone: academies.phone,
      isActive: academies.isActive,
    })
    .from(academies)
    .where(eq(academies.slug, slug))
    .limit(1);

  if (!academy || !academy.isActive) {
    return null;
  }

  return {
    name: academy.name,
    slug: academy.slug,
    tagline: academy.tagline,
    location: academy.location,
    phone: academy.phone,
  };
}
