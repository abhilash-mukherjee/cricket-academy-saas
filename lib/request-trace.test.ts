import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  logger: {
    info: sentry.info,
    warn: sentry.warn,
  },
  captureException: sentry.captureException,
}));

import {
  logActor,
  logWarning,
  logInfo,
  logException,
} from "@/lib/request-trace";

describe("request trace", () => {
  beforeEach(() => {
    sentry.info.mockReset();
    sentry.warn.mockReset();
    sentry.captureException.mockReset();
  });

  it("records a successful command as info and keeps the sentence whole", () => {
    const sentence =
      "Registration accepted successfully with ID: reg-1. " + "A".repeat(250);

    logInfo(sentence, { name: "A".repeat(250) });

    expect(sentry.info).toHaveBeenCalledWith(sentence, {
      name: "A".repeat(200),
    });
    expect(sentry.warn).not.toHaveBeenCalled();
  });

  it("records a known failure as a warning with the error already being returned", () => {
    logWarning(
      "Registration was not accepted with ID: reg-1.",
      "invalid-input",
      { phone: "B".repeat(250), email: null },
    );

    expect(sentry.warn).toHaveBeenCalledWith(
      "Registration was not accepted with ID: reg-1.",
      { phone: "B".repeat(200), error: "invalid-input" },
    );
    expect(sentry.info).not.toHaveBeenCalled();
  });

  it("records the actor as soon as a user id exists", () => {
    logActor("C".repeat(250));

    expect(sentry.info).toHaveBeenCalledWith("actor", {
      userId: "C".repeat(200),
    });
  });

  it("records an audit insert failure as the request exception", () => {
    const failure = new Error("audit insert failed");
    logException(failure);
    expect(sentry.captureException).toHaveBeenCalledWith(failure);
  });

  it("still returns when Sentry throws", () => {
    sentry.info.mockImplementation(() => {
      throw new Error("sentry down");
    });
    sentry.warn.mockImplementation(() => {
      throw new Error("sentry down");
    });
    sentry.captureException.mockImplementation(() => {
      throw new Error("sentry down");
    });

    expect(() =>
      logInfo("Batch created successfully with ID: batch-1."),
    ).not.toThrow();
    expect(() =>
      logWarning("Batch was not created.", "invalid-input"),
    ).not.toThrow();
    expect(() => logException(new Error("audit"))).not.toThrow();
  });
});
