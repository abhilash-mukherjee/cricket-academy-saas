import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PUBLIC_CONVERSION_CACHE_SECONDS } from "./public-conversion";

const revalidatePath = vi.hoisted(() => vi.fn());
const revalidateTag = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath,
  revalidateTag,
}));

import {
  publicAcademyCacheTag,
  revalidatePublicAcademyPages,
} from "./public-academy-pages";

describe("public Academy page cache invalidation", () => {
  it("uses a slug-scoped cache tag", () => {
    expect(publicAcademyCacheTag("blitz-nets")).toBe("public-academy-blitz-nets");
  });

  it("purges Brochure and Conversion routes for an Academy slug", () => {
    revalidatePath.mockClear();
    revalidateTag.mockClear();

    revalidatePublicAcademyPages("blitz-nets");

    expect(revalidateTag).toHaveBeenCalledWith("public-academy-blitz-nets", "max");
    expect(revalidatePath).toHaveBeenCalledWith("/a/blitz-nets");
    expect(revalidatePath).toHaveBeenCalledWith("/a/blitz-nets/join");
  });

  it("Conversion page revalidate is a numeric literal Next.js can statically analyze", () => {
    const source = readFileSync(
      path.join(__dirname, "../app/a/[academySlug]/join/page.tsx"),
      "utf8",
    );

    expect(source).toContain(
      `export const revalidate = ${PUBLIC_CONVERSION_CACHE_SECONDS};`,
    );
  });
});
