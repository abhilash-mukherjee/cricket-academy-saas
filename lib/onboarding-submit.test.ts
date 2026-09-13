import { describe, expect, it } from "vitest";
import { onboardingSubmitSucceeded } from "./onboarding-submit";

describe("onboarding fetch result", () => {
  it("treats an opaque redirect as success so the wizard does not show Could not finish setup", () => {
    const response = new Response(null, {
      status: 200,
      headers: { Location: "/app/dashboard" },
    });
    Object.defineProperty(response, "type", { value: "opaqueredirect" });
    Object.defineProperty(response, "status", { value: 0 });

    expect(onboardingSubmitSucceeded(response)).toBe(true);
  });

  it("treats JSON ok as success", () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    expect(onboardingSubmitSucceeded(response)).toBe(true);
  });

  it("does not treat a validation error as success", () => {
    const response = new Response(JSON.stringify({ error: "invalid-phone" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });

    expect(onboardingSubmitSucceeded(response)).toBe(false);
  });
});
