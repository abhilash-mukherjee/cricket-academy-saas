import { describe, expect, it } from "vitest";
import {
  academyAssetPrefix,
  extensionForMimeType,
  isAcademyScopedStorageKey,
  isAllowedImageMimeType,
  isLegacyHttpStorageKey,
  resolvePublicAssetUrl,
  validateGalleryCount,
} from "./academy-assets";

describe("academy asset storage keys", () => {
  const academyId = "11111111-1111-4111-8111-111111111111";

  it("builds an academy-scoped prefix", () => {
    expect(academyAssetPrefix(academyId)).toBe(
      `academies/${academyId}/`,
    );
  });

  it("accepts keys under the logged-in Academy prefix", () => {
    expect(
      isAcademyScopedStorageKey(
        `academies/${academyId}/brochure-gallery/photo.png`,
        academyId,
      ),
    ).toBe(true);
  });

  it("rejects cross-tenant keys", () => {
    expect(
      isAcademyScopedStorageKey(
        "academies/other-academy/brochure-gallery/photo.png",
        academyId,
      ),
    ).toBe(false);
  });

  it("treats legacy https storage keys as missing", () => {
    expect(isLegacyHttpStorageKey("https://example.com/nets.jpg")).toBe(true);
    expect(
      resolvePublicAssetUrl("https://example.com/nets.jpg"),
    ).toBeNull();
  });

  it("resolves academy storage keys to public Blob URLs", () => {
    const key = `academies/${academyId}/brochure-gallery/photo.png`;
    expect(resolvePublicAssetUrl(key)).toBe(`https://blob.test/${key}`);
  });
});

describe("academy asset upload validation", () => {
  it("allows JPEG, PNG, and WebP", () => {
    expect(isAllowedImageMimeType("image/jpeg")).toBe(true);
    expect(isAllowedImageMimeType("image/png")).toBe(true);
    expect(isAllowedImageMimeType("image/webp")).toBe(true);
    expect(isAllowedImageMimeType("image/gif")).toBe(false);
  });

  it("maps MIME types to file extensions", () => {
    expect(extensionForMimeType("image/jpeg")).toBe("jpg");
    expect(extensionForMimeType("image/png")).toBe("png");
    expect(extensionForMimeType("image/webp")).toBe("webp");
  });

  it("counts saved and draft gallery images toward the cap", () => {
    expect(validateGalleryCount(2, 3)).toBe(true);
    expect(validateGalleryCount(2, 4)).toBe(false);
  });
});
