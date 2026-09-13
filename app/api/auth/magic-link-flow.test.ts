import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { GET, POST } from "./[...all]/route";
import {
  clearCapturedMail,
  enableMailCapture,
  disableMailCapture,
  extractFirstUrl,
  getCapturedMail,
} from "@/lib/mailer";
import { user } from "@/db/auth-schema";
import { getDb } from "@/db/client";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const hasAuthSecret = Boolean(process.env.BETTER_AUTH_SECRET);

describe.skipIf(!hasDatabase || !hasAuthSecret)(
  "staff magic-link auth at the App Router seam",
  () => {
    const testEmail = `staff-${Date.now()}@example.com`;

    beforeEach(() => {
      enableMailCapture();
    });

    afterEach(async () => {
      disableMailCapture();
      clearCapturedMail();

      const db = getDb();
      await db.delete(user).where(eq(user.email, testEmail));
    });

    it("requests a link, captures mail, follows it, and returns a session", async () => {
      const origin = "http://localhost:3000";

      const signInResponse = await POST(
        new Request(`${origin}/api/auth/sign-in/magic-link`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
          },
          body: JSON.stringify({
            email: testEmail,
            name: "Test Owner",
            callbackURL: "/app",
          }),
        }),
      );

      expect(signInResponse.status).toBe(200);

      const captured = getCapturedMail();
      expect(captured).toHaveLength(1);
      expect(captured[0]?.to).toBe(testEmail);

      const verifyUrl = extractFirstUrl(captured[0]?.html ?? "");
      expect(verifyUrl).toBeTruthy();

      const verifyRequest = new Request(verifyUrl!, {
        method: "GET",
        headers: { origin },
        redirect: "manual",
      });
      const verifyResponse = await GET(verifyRequest);
      expect(verifyResponse.status).toBeGreaterThanOrEqual(300);
      expect(verifyResponse.status).toBeLessThan(400);

      const setCookie = verifyResponse.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();

      const sessionResponse = await GET(
        new Request(`${origin}/api/auth/get-session`, {
          headers: {
            cookie: setCookie!,
            origin,
          },
        }),
      );

      expect(sessionResponse.status).toBe(200);
      const sessionBody = await sessionResponse.json();
      expect(sessionBody.user.email).toBe(testEmail);
    });
  },
);
