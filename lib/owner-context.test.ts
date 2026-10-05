import { describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
  captureException: sentry.captureException,
}));

vi.mock("@/db/client", () => ({
  getDb: () => ({
    insert: () => ({
      values: async () => {
        throw new Error("audit insert failed");
      },
    }),
  }),
}));

import {
  recordOwnerWriteIfImpersonating,
  type OwnerContext,
} from "@/lib/owner-context";

describe("impersonation audit after a committed write", () => {
  it("returns success and records the insert failure as the request exception", async () => {
    const context = {
      ok: true,
      academy: { id: "academy-1" },
      actorUserId: "actor-1",
      subjectUserId: "subject-1",
      impersonation: {
        academyId: "academy-1",
        subjectUserId: "subject-1",
        subjectEmail: "owner@example.com",
        academy: { id: "academy-1" },
      },
    } as Extract<OwnerContext, { ok: true }>;

    await expect(
      recordOwnerWriteIfImpersonating(context, "registration.accept", {
        registrationId: "reg-1",
      }),
    ).resolves.toBeUndefined();

    expect(sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "audit insert failed" }),
    );
  });
});
