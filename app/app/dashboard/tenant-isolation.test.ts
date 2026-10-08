import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as verifyAuth, POST as authPost } from "@/app/api/auth/[...all]/route";
import { POST as completeOnboarding } from "@/app/api/onboarding/route";
import {
  clearCapturedMail,
  disableMailCapture,
  enableMailCapture,
  extractFirstUrl,
  getCapturedMail,
} from "@/lib/mailer";
import { academies, batches } from "@/db/domain-schema";
import { user } from "@/db/auth-schema";
import { getDb } from "@/db/client";
import { listBatches } from "@/lib/batches";
import { getOwnedAcademy } from "@/lib/owner-onboarding";

const sessionCookie = vi.hoisted(() => ({ value: "" }));

vi.mock("next/headers", () => ({
  headers: async () => {
    const headers = new Headers();
    if (sessionCookie.value) {
      headers.set("cookie", sessionCookie.value);
    }
    return headers;
  },
}));

const hasDatabase = Boolean(process.env.DATABASE_URL);
const hasAuthSecret = Boolean(process.env.BETTER_AUTH_SECRET);
const origin = "http://localhost:3000";

async function signInOwner(email: string, name: string): Promise<string> {
  const signInResponse = await authPost(
    new Request(`${origin}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
      },
      body: JSON.stringify({
        email,
        name,
        callbackURL: "/app",
      }),
    }),
  );
  expect(signInResponse.status).toBe(200);

  const verifyUrl = extractFirstUrl(getCapturedMail().at(-1)?.html ?? "");
  expect(verifyUrl).toBeTruthy();

  const verifyResponse = await verifyAuth(
    new Request(verifyUrl!, {
      method: "GET",
      headers: { origin },
      redirect: "manual",
    }),
  );
  const setCookie = verifyResponse.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!;
}

async function onboardOwner(
  cookie: string,
  input: {
    displayName: string;
    academyName: string;
    slug: string;
    batchName: string;
  },
) {
  const response = await completeOnboarding(
    new Request(`${origin}/api/onboarding`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie,
      },
      body: JSON.stringify(input),
    }),
  );
  expect(response.status).toBe(200);
}

async function sessionUserId(cookie: string): Promise<string> {
  const sessionResponse = await verifyAuth(
    new Request(`${origin}/api/auth/get-session`, {
      headers: {
        cookie,
        origin,
      },
    }),
  );
  expect(sessionResponse.status).toBe(200);
  const body = (await sessionResponse.json()) as { user: { id: string } };
  return body.user.id;
}

async function deleteOwnerByEmail(email: string) {
  const db = getDb();
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (owner) {
    const owned = await db
      .select({ id: academies.id })
      .from(academies)
      .where(eq(academies.ownerUserId, owner.id));
    for (const academy of owned) {
      await db.delete(batches).where(eq(batches.academyId, academy.id));
      await db.delete(academies).where(eq(academies.id, academy.id));
    }
  }
  await db.delete(user).where(eq(user.email, email));
}

describe.skipIf(!hasDatabase || !hasAuthSecret)(
  "Academy-scoped reads at the listBatches and dashboard seams",
  () => {
    const stamp = Date.now();
    const ownerAEmail = `owner-a-${stamp}@example.com`;
    const ownerBEmail = `owner-b-${stamp}@example.com`;
    const slugA = `blitz-${stamp}`;
    const slugB = `rival-${stamp}`;

    beforeEach(() => {
      enableMailCapture();
      sessionCookie.value = "";
    });

    afterEach(async () => {
      disableMailCapture();
      clearCapturedMail();
      sessionCookie.value = "";
      await deleteOwnerByEmail(ownerAEmail);
      await deleteOwnerByEmail(ownerBEmail);
    });

    it("keeps Batches on the session Academy, not another Academy", async () => {
      const cookieA = await signInOwner(ownerAEmail, "Asha Rao");
      await onboardOwner(cookieA, {
        displayName: "Asha Rao",
        academyName: "Blitz Cricket Academy",
        slug: slugA,
        batchName: "U-14 evening",
      });

      const cookieB = await signInOwner(ownerBEmail, "Bala Sen");
      await onboardOwner(cookieB, {
        displayName: "Bala Sen",
        academyName: "Rival Cricket Academy",
        slug: slugB,
        batchName: "Weekend nets",
      });

      const academyA = await getOwnedAcademy(await sessionUserId(cookieA));
      const academyB = await getOwnedAcademy(await sessionUserId(cookieB));
      expect(academyA).toBeTruthy();
      expect(academyB).toBeTruthy();

      await expect(listBatches(academyA!.id)).resolves.toEqual([
        expect.objectContaining({
          name: "U-14 evening",
          isOpenForRegistration: false,
        }),
      ]);
      await expect(listBatches(academyB!.id)).resolves.toEqual([
        expect.objectContaining({
          name: "Weekend nets",
          isOpenForRegistration: false,
        }),
      ]);

      sessionCookie.value = cookieA;
      const { default: DashboardPage } = await import("./page");
      const html = renderToStaticMarkup(await DashboardPage());

      expect(html).toContain("Blitz Cricket Academy");
      expect(html).toContain(`/a/${slugA}`);
      expect(html).not.toContain("Rival Cricket Academy");
      expect(html).not.toContain("Weekend nets");
      expect(html).not.toContain(`/a/${slugB}`);
    });
  },
);
