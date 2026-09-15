import { describe, expect, it, vi } from "vitest";

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
});
