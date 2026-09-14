import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AcademyBrochurePage from "./page";
import AcademyNotFound from "./not-found";
import { ACADEMY_NOT_FOUND } from "@/lib/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL);

function isAcademyNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    error.digest === "NEXT_HTTP_ERROR_FALLBACK;404"
  );
}

describe.skipIf(!hasDatabase)("public Academy brochure at the App Router seam", () => {
  it("returns 404 Academy not found for an unknown slug", async () => {
    const academySlug = "no-such-academy";

    await expect(
      AcademyBrochurePage({
        params: Promise.resolve({ academySlug }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toSatisfy(isAcademyNotFound);

    expect(renderToStaticMarkup(<AcademyNotFound />)).toContain(
      ACADEMY_NOT_FOUND,
    );
  });
});
