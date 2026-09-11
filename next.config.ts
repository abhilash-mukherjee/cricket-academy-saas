import type { NextConfig } from "next";
import { noindexRobotsTag } from "./lib/deployment-environment";

const nextConfig: NextConfig = {
  async headers() {
    const robotsTag = noindexRobotsTag(process.env);
    if (!robotsTag) {
      return [];
    }

    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: robotsTag }],
      },
    ];
  },
};

export default nextConfig;
