import { describe, expect, it } from "vitest";
import {
  deploymentTarget,
  robotsNoindex,
} from "./deployment-environment";

describe("deployment target on the bootstrap page", () => {
  it("names a Vercel custom environment from VERCEL_TARGET_ENV", () => {
    expect(deploymentTarget({ VERCEL_TARGET_ENV: "dev" })).toBe("dev");
    expect(deploymentTarget({ VERCEL_TARGET_ENV: "staging" })).toBe("staging");
  });

  it("names production and preview from VERCEL_TARGET_ENV", () => {
    expect(deploymentTarget({ VERCEL_TARGET_ENV: "production" })).toBe(
      "production",
    );
    expect(deploymentTarget({ VERCEL_TARGET_ENV: "preview" })).toBe("preview");
  });

  it("names a laptop run as local when Vercel target is unset", () => {
    expect(deploymentTarget({})).toBe("local");
  });
});

describe("noindex on non-production responses", () => {
  it("omits noindex on production (VERCEL_ENV or VERCEL_TARGET_ENV)", () => {
    expect(robotsNoindex({ VERCEL_ENV: "production" })).toBeUndefined();
    expect(
      robotsNoindex({
        VERCEL_ENV: "production",
        VERCEL_TARGET_ENV: "production",
      }),
    ).toBeUndefined();
  });

  it("includes noindex when a custom environment reports VERCEL_ENV production", () => {
    expect(
      robotsNoindex({
        VERCEL_ENV: "production",
        VERCEL_TARGET_ENV: "dev",
      }),
    ).toEqual({ index: false, follow: false });
    expect(
      robotsNoindex({
        VERCEL_ENV: "production",
        VERCEL_TARGET_ENV: "staging",
      }),
    ).toEqual({ index: false, follow: false });
  });

  it("includes noindex for preview, custom environments, and local", () => {
    expect(robotsNoindex({ VERCEL_ENV: "preview" })).toEqual({
      index: false,
      follow: false,
    });
    expect(robotsNoindex({ VERCEL_ENV: "development" })).toEqual({
      index: false,
      follow: false,
    });
    expect(robotsNoindex({})).toEqual({ index: false, follow: false });
  });
});
