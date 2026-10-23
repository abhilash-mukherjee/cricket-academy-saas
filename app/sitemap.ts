import type { MetadataRoute } from "next";
import { listActiveBrochureUrls } from "@/lib/public-brochure";

/**
 * Next caches sitemap.ts forever by default. Without a revalidate window, a
 * build with no active Academies (or no DB) freezes an empty sitemap on the CDN.
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls = await listActiveBrochureUrls();
  return urls.map((url) => ({ url }));
}
