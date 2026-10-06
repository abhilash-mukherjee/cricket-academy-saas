import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as verifyAuth, POST as authPost } from "../auth/[...all]/route";
import { POST as completeOnboarding } from "../onboarding/route";
import { POST as createBatch } from "../batches/route";
import { PATCH as patchBatch } from "../batches/[batchId]/route";
import { POST as createFeeOption } from "../batches/[batchId]/fee-options/route";
import { POST as saveConversion } from "../conversion/route";
import { POST as postRegistration } from "../a/[academySlug]/registrations/route";
import { POST as acceptRegistration } from "./[registrationId]/accept/route";
import { POST as rejectRegistration } from "./[registrationId]/reject/route";
import {
  clearCapturedMail,
  disableMailCapture,
  enableMailCapture,
  extractFirstUrl,
  getCapturedMail,
} from "@/lib/mailer";
import {
  academies,
  batchFeeOptions,
  batches,
  enrollmentPauses,
  enrollments,
  players,
  registrations,
} from "@/db/domain-schema";
import { user } from "@/db/auth-schema";
import { getDb } from "@/db/client";
import { calendarDateInIst } from "@/lib/player-age";
import { formatCalendarDate } from "@/lib/format-date";
import { addCalendarDays, lastCoveredDay } from "@/lib/enrollment-term";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { listBatches } from "@/lib/batches";
import { inboxErrorCopy } from "@/app/app/registrations/inbox";

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

async function signInOwner(email: string): Promise<string> {
  const signInResponse = await authPost(
    new Request(`${origin}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({
        email,
        name: "Asha Rao",
        callbackURL: "/app",
      }),
    }),
  );
  expect(signInResponse.status).toBe(200);
  const verifyUrl = extractFirstUrl(getCapturedMail().at(-1)?.html ?? "");
  const verifyResponse = await verifyAuth(
    new Request(verifyUrl!, {
      method: "GET",
      headers: { origin },
      redirect: "manual",
    }),
  );
  return verifyResponse.headers.get("set-cookie")!;
}

async function onboardOwner(cookie: string, slug: string) {
  const response = await completeOnboarding(
    new Request(`${origin}/api/onboarding`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, cookie },
      body: JSON.stringify({
        displayName: "Asha Rao",
        academyName: "Blitz Cricket Academy",
        slug,
        batchName: "U-14 evening",
      }),
    }),
  );
  expect(response.status).toBe(200);
}

async function openBatch(
  cookie: string,
  batchId: string,
  options: { daysPerWeek?: number; termDays?: number; feeInr?: number } = {},
) {
  const created = await createFeeOption(
    new Request(`${origin}/api/batches/${batchId}/fee-options`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, cookie },
      body: JSON.stringify({
        daysPerWeek: options.daysPerWeek ?? 3,
        termDays: options.termDays ?? 45,
        feeInr: options.feeInr ?? 15000,
        label: "Weekday nets",
      }),
    }),
    { params: Promise.resolve({ batchId }) },
  );
  expect(created.status).toBe(200);
  const body = (await created.json()) as { id: string };
  const opened = await patchBatch(
    new Request(`${origin}/api/batches/${batchId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin, cookie },
      body: JSON.stringify({ isOpenForRegistration: true }),
    }),
    { params: Promise.resolve({ batchId }) },
  );
  expect(opened.status).toBe(200);
  return body.id;
}

async function submit(
  slug: string,
  feeOptionId: string,
  body: Record<string, unknown>,
) {
  return postRegistration(
    new Request(`${origin}/api/a/${slug}/registrations`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ batchFeeOptionId: feeOptionId, ...body }),
    }),
    { params: Promise.resolve({ academySlug: slug }) },
  );
}

function accept(cookie: string, registrationId: string, validFrom: string) {
  return acceptRegistration(
    new Request(`${origin}/api/registrations/${registrationId}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, cookie },
      body: JSON.stringify({ validFrom }),
    }),
    { params: Promise.resolve({ registrationId }) },
  );
}

function reject(cookie: string, registrationId: string) {
  return rejectRegistration(
    new Request(`${origin}/api/registrations/${registrationId}/reject`, {
      method: "POST",
      headers: { origin, cookie },
    }),
    { params: Promise.resolve({ registrationId }) },
  );
}

async function pendingId(academyId: string, name: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(
      and(
        eq(registrations.academyId, academyId),
        eq(registrations.playerFullName, name),
        eq(registrations.status, "pending"),
      ),
    )
    .limit(1);
  return row.id;
}

const adult = {
  playerFullName: "Arjun Rao",
  playerDateOfBirth: "1990-06-15",
  playerPhone: "9876543210",
  contactEmail: "arjun@example.com",
  note: "Evening preferred.",
};

const child = {
  playerFullName: "Mini Rao",
  playerDateOfBirth: "2015-06-15",
  guardianFullName: "Asha Rao",
  guardianPhone: "9876543210",
};

async function deleteOwner(email: string) {
  const db = getDb();
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!owner) {
    return;
  }
  const owned = await db
    .select({ id: academies.id })
    .from(academies)
    .where(eq(academies.ownerUserId, owner.id));
  for (const academy of owned) {
    await db
      .delete(enrollmentPauses)
      .where(eq(enrollmentPauses.academyId, academy.id));
    await db.delete(enrollments).where(eq(enrollments.academyId, academy.id));
    await db
      .delete(registrations)
      .where(eq(registrations.academyId, academy.id));
    await db.delete(players).where(eq(players.academyId, academy.id));
    await db
      .delete(batchFeeOptions)
      .where(eq(batchFeeOptions.academyId, academy.id));
    await db.delete(batches).where(eq(batches.academyId, academy.id));
    await db.delete(academies).where(eq(academies.id, academy.id));
  }
  await db.delete(user).where(eq(user.email, email));
}

describe.skipIf(!hasDatabase || !hasAuthSecret)(
  "Owner Registration inbox at the App Router seam",
  () => {
    const stamp = Date.now();
    const ownerEmail = `inbox-owner-${stamp}@example.com`;
    const otherEmail = `inbox-other-${stamp}@example.com`;
    const slug = `inbox-${stamp}`;
    const otherSlug = `inbox-other-${stamp}`;

    beforeEach(() => {
      enableMailCapture();
      sessionCookie.value = "";
    });

    afterEach(async () => {
      disableMailCapture();
      clearCapturedMail();
      sessionCookie.value = "";
      await deleteOwner(ownerEmail);
      await deleteOwner(otherEmail);
    });

    it("accepts onto a new Player and Enrollment, then links that Player on another Batch", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = (await getOwnedAcademy(
        (
          await verifyAuth(
            new Request(`${origin}/api/auth/get-session`, {
              headers: { cookie, origin },
            }),
          ).then((response) => response.json())
        ).user.id,
      ))!;
      const [firstBatch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, firstBatch.id, {
        termDays: 45,
        feeInr: 15000,
      });

      const submitted = await submit(slug, feeOptionId, child);
      expect(submitted.status).toBe(200);
      const registrationId = await pendingId(academy.id, "Mini Rao");
      const today = calendarDateInIst();
      const accepted = await accept(cookie, registrationId, today);
      expect(accepted.status).toBe(200);

      const db = getDb();
      const [player] = await db
        .select()
        .from(players)
        .where(eq(players.academyId, academy.id));
      expect(player).toMatchObject({
        fullName: "Mini Rao",
        phone: "+919876543210",
        dateOfBirth: "2015-06-15",
        guardianFullName: "Asha Rao",
        guardianPhone: "+919876543210",
      });
      const [enrollment] = await db
        .select()
        .from(enrollments)
        .where(eq(enrollments.academyId, academy.id));
      expect(enrollment).toMatchObject({
        playerId: player.id,
        batchId: firstBatch.id,
        registrationId,
        daysPerWeek: 3,
        termDays: 45,
        feePaisePaid: 1_500_000,
        validFrom: today,
        validUntil: lastCoveredDay(today, 45),
        renewedFromEnrollmentId: null,
      });

      const second = await createBatch(
        new Request(`${origin}/api/batches`, {
          method: "POST",
          headers: { "content-type": "application/json", origin, cookie },
          body: JSON.stringify({ name: "U-16 morning" }),
        }),
      );
      expect(second.status).toBe(200);
      const secondBody = (await second.json()) as { id: string };
      const secondFee = await openBatch(cookie, secondBody.id, {
        termDays: 30,
        feeInr: 8000,
      });
      const again = await submit(slug, secondFee, {
        ...child,
        guardianFullName: "Other Guardian",
        playerDateOfBirth: "2014-01-01",
      });
      expect(again.status).toBe(200);
      const secondId = await pendingId(academy.id, "Mini Rao");
      const linked = await accept(cookie, secondId, today);
      expect(linked.status).toBe(200);

      const roster = await db
        .select()
        .from(players)
        .where(eq(players.academyId, academy.id));
      expect(roster).toHaveLength(1);
      expect(roster[0]).toMatchObject({
        fullName: "Mini Rao",
        dateOfBirth: "2015-06-15",
        guardianFullName: "Asha Rao",
      });
      const placed = await db
        .select({ batchId: enrollments.batchId })
        .from(enrollments)
        .where(eq(enrollments.playerId, player.id));
      expect(placed.map((row) => row.batchId).sort()).toEqual(
        [firstBatch.id, secondBody.id].sort(),
      );
    }, 20_000);

    it("lets a visitor submit again after reject", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const submitted = await submit(slug, feeOptionId, adult);
      expect(submitted.status).toBe(200);
      const registrationId = await pendingId(academy.id, "Arjun Rao");
      const rejected = await reject(cookie, registrationId);
      expect(rejected.status).toBe(200);

      const again = await submit(slug, feeOptionId, adult);
      expect(again.status).toBe(200);
      const db = getDb();
      const rows = await db
        .select({ status: registrations.status })
        .from(registrations)
        .where(eq(registrations.academyId, academy.id));
      expect(rows.map((row) => row.status).sort()).toEqual([
        "pending",
        "rejected",
      ]);
    });

    it("leaves the Registration pending and writes no Player when the term overlaps or a pause is open", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();

      await submit(slug, feeOptionId, adult);
      const firstId = await pendingId(academy.id, "Arjun Rao");
      expect((await accept(cookie, firstId, today)).status).toBe(200);

      await submit(slug, feeOptionId, adult);
      const overlapId = await pendingId(academy.id, "Arjun Rao");
      const overlapped = await accept(cookie, overlapId, today);
      expect(overlapped.status).toBe(409);
      await expect(overlapped.json()).resolves.toEqual({ error: "overlaps" });

      const db = getDb();
      const [enrollment] = await db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(eq(enrollments.academyId, academy.id));
      await db.insert(enrollmentPauses).values({
        academyId: academy.id,
        enrollmentId: enrollment.id,
        pausedOn: today,
      });

      const paused = await accept(cookie, overlapId, today);
      expect(paused.status).toBe(409);
      await expect(paused.json()).resolves.toEqual({ error: "paused" });

      const [stillPending] = await db
        .select({ status: registrations.status })
        .from(registrations)
        .where(eq(registrations.id, overlapId));
      expect(stillPending.status).toBe("pending");
      const roster = await db
        .select({ id: players.id })
        .from(players)
        .where(eq(players.academyId, academy.id));
      expect(roster).toHaveLength(1);
      expect(inboxErrorCopy("overlaps")).toContain("Reject");
      expect(inboxErrorCopy("paused")).toContain("Reject");
    }, 20_000);

    it("writes no Player when the term would not cover today", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id, { termDays: 1 });
      await submit(slug, feeOptionId, adult);
      const registrationId = await pendingId(academy.id, "Arjun Rao");
      const missed = await accept(cookie, registrationId, "2020-01-01");
      expect(missed.status).toBe(409);
      await expect(missed.json()).resolves.toEqual({
        error: "term-not-covering-today",
      });
      const db = getDb();
      const roster = await db
        .select({ id: players.id })
        .from(players)
        .where(eq(players.academyId, academy.id));
      expect(roster).toHaveLength(0);
      const [row] = await db
        .select({ status: registrations.status })
        .from(registrations)
        .where(eq(registrations.id, registrationId));
      expect(row.status).toBe("pending");
    });

    it("accepts when the Batch is closed and online Registration is off", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      await submit(slug, feeOptionId, adult);
      const registrationId = await pendingId(academy.id, "Arjun Rao");

      const closed = await patchBatch(
        new Request(`${origin}/api/batches/${batch.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", origin, cookie },
          body: JSON.stringify({ isOpenForRegistration: false }),
        }),
        { params: Promise.resolve({ batchId: batch.id }) },
      );
      expect(closed.status).toBe(200);
      const offline = await saveConversion(
        new Request(`${origin}/api/conversion`, {
          method: "POST",
          headers: { "content-type": "application/json", origin, cookie },
          body: JSON.stringify({ isOnlineRegistrationAllowed: false }),
        }),
      );
      expect(offline.status).toBe(200);

      const accepted = await accept(cookie, registrationId, calendarDateInIst());
      expect(accepted.status).toBe(200);
    });

    it("hides another Academy's Registrations from read and accept or reject", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      await submit(slug, feeOptionId, adult);
      const registrationId = await pendingId(academy.id, "Arjun Rao");

      const otherCookie = await signInOwner(otherEmail);
      await onboardOwner(otherCookie, otherSlug);
      const stolen = await accept(otherCookie, registrationId, calendarDateInIst());
      expect(stolen.status).toBe(404);
      await expect(stolen.json()).resolves.toEqual({ error: "not-found" });
      const refused = await reject(otherCookie, registrationId);
      expect(refused.status).toBe(404);

      sessionCookie.value = otherCookie;
      const { default: RegistrationsPage } = await import(
        "@/app/app/registrations/page"
      );
      const html = renderToStaticMarkup(await RegistrationsPage());
      expect(html).toContain("No pending Registrations.");
      expect(html).not.toContain("Arjun Rao");

      const db = getDb();
      const [row] = await db
        .select({ status: registrations.status })
        .from(registrations)
        .where(eq(registrations.id, registrationId));
      expect(row.status).toBe("pending");
    }, 20_000);

    it("lists pending Registrations newest first, with package, match, and collapsed details", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();

      await submit(slug, feeOptionId, adult);
      const firstId = await pendingId(academy.id, "Arjun Rao");
      expect((await accept(cookie, firstId, today)).status).toBe(200);

      const secondBatch = await createBatch(
        new Request(`${origin}/api/batches`, {
          method: "POST",
          headers: { "content-type": "application/json", origin, cookie },
          body: JSON.stringify({ name: "U-16 morning" }),
        }),
      );
      const secondBody = (await secondBatch.json()) as { id: string };
      const secondFee = await openBatch(cookie, secondBody.id);
      await submit(slug, secondFee, {
        ...adult,
        playerDateOfBirth: "1991-01-01",
      });
      await submit(slug, feeOptionId, {
        playerFullName: "Later Player",
        playerDateOfBirth: "2000-01-01",
        playerPhone: "9876543211",
      });

      sessionCookie.value = cookie;
      const { default: RegistrationsPage } = await import(
        "@/app/app/registrations/page"
      );
      const html = renderToStaticMarkup(await RegistrationsPage());
      expect(html).toContain("Registrations");
      expect(html.indexOf("Later Player")).toBeLessThan(
        html.indexOf("Arjun Rao"),
      );
      expect(html).toContain("Phone: +919876543210");
      expect(html).toContain("U-16 morning");
      expect(html).toContain("3 days per week · 45 days · ₹15,000");
      expect(html).toContain(
        `Covers through ${formatCalendarDate(lastCoveredDay(today, 45))}`,
      );
      expect(html).toContain(
        "Links to existing Player: Arjun Rao · +919876543210",
      );
      expect(html).toContain(
        `Existing Player DOB is ${formatCalendarDate("1990-06-15")}; this Registration has ${formatCalendarDate("1991-01-01")} — existing values will be kept`,
      );
      expect(html).toContain("<details");
      expect(html).not.toContain("<details open");
      expect(html).toContain("More details");
      expect(html).toContain("Email: arjun@example.com");
      expect(html).toContain("Note: Evening preferred.");
      expect(html).not.toContain("Accept this Registration?");
    }, 20_000);

    it("records a later start on accept and still copies Guardian", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id, { termDays: 30 });
      const today = calendarDateInIst();
      const startsOn = addCalendarDays(today, 12);

      await submit(slug, feeOptionId, child);
      const registrationId = await pendingId(academy.id, "Mini Rao");
      const accepted = await accept(cookie, registrationId, startsOn);
      expect(accepted.status).toBe(200);

      const db = getDb();
      const [player] = await db
        .select()
        .from(players)
        .where(eq(players.academyId, academy.id));
      expect(player).toMatchObject({
        dateOfBirth: "2015-06-15",
        guardianFullName: "Asha Rao",
        guardianPhone: "+919876543210",
      });
      const [enrollment] = await db
        .select()
        .from(enrollments)
        .where(eq(enrollments.academyId, academy.id));
      expect(enrollment).toMatchObject({
        validFrom: today,
        validUntil: lastCoveredDay(today, 30),
        registrationId,
      });
      const [pause] = await db
        .select()
        .from(enrollmentPauses)
        .where(eq(enrollmentPauses.enrollmentId, enrollment.id));
      expect(pause).toMatchObject({
        pausedOn: today,
        plannedLastPausedOn: addCalendarDays(startsOn, -1),
        isDeferred: true,
        resumedOn: null,
      });
      expect(inboxErrorCopy("starts-later")).toContain("starts later");
      expect(inboxErrorCopy("starts-later")).toContain("Reject");
    }, 20_000);
  },
);

async function academyFor(cookie: string) {
  const sessionResponse = await verifyAuth(
    new Request(`${origin}/api/auth/get-session`, {
      headers: { cookie, origin },
    }),
  );
  const body = (await sessionResponse.json()) as { user: { id: string } };
  const academy = await getOwnedAcademy(body.user.id);
  expect(academy).toBeTruthy();
  return academy!;
}
