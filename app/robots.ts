import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/public-origin";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/a/",
      disallow: "/app/",
    },
    sitemap: `${publicOrigin()}/sitemap.xml`,
  };
}
