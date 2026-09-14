import type { MetadataRoute } from "next";
import { listActiveBrochureUrls } from "@/lib/public-brochure";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls = await listActiveBrochureUrls();
  return urls.map((url) => ({ url }));
}
