import { revalidatePath, revalidateTag } from "next/cache";

/** Shared cache tag for Brochure and Conversion loaders keyed by Academy slug. */
export function publicAcademyCacheTag(slug: string): string {
  return `public-academy-${slug}`;
}

/** Purge cached public Brochure and Conversion HTML after a staff mutation. */
export function revalidatePublicAcademyPages(slug: string): void {
  revalidateTag(publicAcademyCacheTag(slug), "max");
  revalidatePath(`/a/${slug}`);
  revalidatePath(`/a/${slug}/join`);
}
