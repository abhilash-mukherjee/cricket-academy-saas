import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { GET as verifyAuth, POST as authPost } from "../auth/[...all]/route";
import { POST as completeOnboarding } from "../onboarding/route";
import { POST as createFeeOption } from "../batches/[batchId]/fee-options/route";
import { PATCH as patchBatch } from "../batches/[batchId]/route";
import { POST as manualAdd } from "../players/route";
import { POST as pauseEnrollment } from "./[enrollmentId]/pause/route";
import { POST as resumeEnrollment } from "./[enrollmentId]/resume/route";
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
import { addCalendarDays, lastCoveredDay } from "@/lib/enrollment-term";
import { calendarDateInIst } from "@/lib/player-age";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { listBatches } from "@/lib/batches";
import { getPlayer } from "@/lib/players";

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

async function academyFor(cookie: string) {
  const session = await verifyAuth(
    new Request(`${origin}/api/auth/get-session`, {
      headers: { cookie, origin },
    }),
  );
  const body = (await session.json()) as { user: { id: string } };
  return (await getOwnedAcademy(body.user.id))!;
}

async function openBatch(cookie: string, batchId: string) {
  const created = await createFeeOption(
    new Request(`${origin}/api/batches/${batchId}/fee-options`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, cookie },
      body: JSON.stringify({
        daysPerWeek: 3,
        termDays: 45,
        feeInr: 15000,
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

function addPlayer(cookie: string, body: Record<string, unknown>) {
  return manualAdd(
    new Request(`${origin}/api/players`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, cookie },
      body: JSON.stringify(body),
    }),
  );
}

function pause(
  cookie: string,
  enrollmentId: string,
  body: Record<string, unknown>,
) {
  return pauseEnrollment(
    new Request(`${origin}/api/enrollments/${enrollmentId}/pause`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, cookie },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ enrollmentId }) },
  );
}

function resume(cookie: string, enrollmentId: string) {
  return resumeEnrollment(
    new Request(`${origin}/api/enrollments/${enrollmentId}/resume`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, cookie },
    }),
    { params: Promise.resolve({ enrollmentId }) },
  );
}

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

const adult = {
  playerFullName: "Arjun Rao",
  playerDateOfBirth: "1990-06-15",
  playerPhone: "9876543210",
  contactEmail: "arjun@example.com",
};

describe.skipIf(!hasDatabase || !hasAuthSecret)(
  "Owner pause and resume Enrollment at the HTTP seam",
  () => {
    const stamp = Date.now();
    const ownerEmail = `pause-owner-${stamp}@example.com`;
    const otherEmail = `pause-other-${stamp}@example.com`;
    const slug = `pause-${stamp}`;
    const otherSlug = `pause-other-${stamp}`;

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

    it("pauses an Enrollment open-ended and shows paused on Player detail", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();

      const created = await addPlayer(cookie, {
        ...adult,
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: today,
      });
      expect(created.status).toBe(200);
      const { playerId } = (await created.json()) as { playerId: string };
      const detail = await getPlayer(academy.id, playerId, today);
      const enrollmentId = detail!.enrollments[0]!.id;

      const response = await pause(cookie, enrollmentId, {
        pausedOn: today,
        plannedLastPausedOn: null,
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        ok: true,
        outcome: "paused",
        pausedOn: today,
        plannedLastPausedOn: null,
      });

      const after = await getPlayer(academy.id, playerId, today);
      expect(after!.enrollments[0]).toMatchObject({
        status: "paused",
        pausedOn: today,
        plannedLastPausedOn: null,
        effectiveValidUntil: lastCoveredDay(today, 45),
      });
    }, 20_000);

    it("resumes and extends valid-until by the paused days", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();
      const validFrom = addCalendarDays(today, -5);
      const pausedOn = addCalendarDays(today, -3);

      const created = await addPlayer(cookie, {
        ...adult,
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom,
      });
      expect(created.status).toBe(200);
      const { playerId } = (await created.json()) as { playerId: string };
      const detail = await getPlayer(academy.id, playerId, today);
      const enrollmentId = detail!.enrollments[0]!.id;
      const beforeUntil = detail!.enrollments[0]!.effectiveValidUntil;

      const paused = await pause(cookie, enrollmentId, {
        pausedOn,
        plannedLastPausedOn: null,
      });
      expect(paused.status).toBe(200);

      const resumed = await resume(cookie, enrollmentId);
      expect(resumed.status).toBe(200);
      await expect(resumed.json()).resolves.toEqual({
        ok: true,
        daysAdded: 3,
        validUntil: addCalendarDays(beforeUntil, 3),
      });

      const after = await getPlayer(academy.id, playerId, today);
      expect(after!.enrollments[0]).toMatchObject({
        status: "active",
        pausedOn: null,
        effectiveValidUntil: addCalendarDays(beforeUntil, 3),
      });
    }, 20_000);

    it("rejects pause on a lapsed Enrollment and when already paused", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();

      const created = await addPlayer(cookie, {
        ...adult,
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: today,
      });
      const { playerId } = (await created.json()) as { playerId: string };
      const detail = await getPlayer(academy.id, playerId, today);
      const enrollmentId = detail!.enrollments[0]!.id;

      const db = getDb();
      await db
        .update(enrollments)
        .set({ validUntil: addCalendarDays(today, -1) })
        .where(eq(enrollments.id, enrollmentId));

      const lapsed = await pause(cookie, enrollmentId, {
        pausedOn: today,
        plannedLastPausedOn: null,
      });
      expect(lapsed.status).toBe(409);
      await expect(lapsed.json()).resolves.toEqual({ error: "lapsed" });

      await db
        .update(enrollments)
        .set({ validUntil: lastCoveredDay(today, 45) })
        .where(eq(enrollments.id, enrollmentId));

      const first = await pause(cookie, enrollmentId, {
        pausedOn: today,
        plannedLastPausedOn: null,
      });
      expect(first.status).toBe(200);

      const second = await pause(cookie, enrollmentId, {
        pausedOn: today,
        plannedLastPausedOn: null,
      });
      expect(second.status).toBe(409);
      await expect(second.json()).resolves.toEqual({
        error: "already-paused",
      });
    }, 20_000);

    it("rejects a pause that overlaps a finished pause interval", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();
      const validFrom = addCalendarDays(today, -10);

      const created = await addPlayer(cookie, {
        ...adult,
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom,
      });
      const { playerId } = (await created.json()) as { playerId: string };
      const detail = await getPlayer(academy.id, playerId, today);
      const enrollmentId = detail!.enrollments[0]!.id;
      const priorUntil = detail!.enrollments[0]!.effectiveValidUntil;

      const t1 = addCalendarDays(today, -8);
      const t2 = addCalendarDays(today, -5);
      const finished = await pause(cookie, enrollmentId, {
        pausedOn: t1,
        plannedLastPausedOn: t2,
      });
      expect(finished.status).toBe(200);
      await expect(finished.json()).resolves.toEqual({
        ok: true,
        outcome: "settled",
        daysAdded: 4,
        validUntil: addCalendarDays(priorUntil, 4),
      });

      const overlapDay = addCalendarDays(today, -6);
      const overlapped = await pause(cookie, enrollmentId, {
        pausedOn: overlapDay,
        plannedLastPausedOn: null,
      });
      expect(overlapped.status).toBe(409);
      await expect(overlapped.json()).resolves.toEqual({
        error: "pause-overlaps",
      });

      const afterOverlap = await getPlayer(academy.id, playerId, today);
      expect(afterOverlap!.enrollments[0]).toMatchObject({
        status: "active",
        effectiveValidUntil: addCalendarDays(priorUntil, 4),
      });

      const gapDay = addCalendarDays(today, -9);
      const inGap = await pause(cookie, enrollmentId, {
        pausedOn: gapDay,
        plannedLastPausedOn: gapDay,
      });
      expect(inGap.status).toBe(200);
      await expect(inGap.json()).resolves.toMatchObject({
        ok: true,
        outcome: "settled",
        daysAdded: 1,
      });
    }, 20_000);

    it("resumes a same-day pause with zero days added", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();

      const created = await addPlayer(cookie, {
        ...adult,
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: today,
      });
      const { playerId } = (await created.json()) as { playerId: string };
      const detail = await getPlayer(academy.id, playerId, today);
      const enrollmentId = detail!.enrollments[0]!.id;
      const until = detail!.enrollments[0]!.effectiveValidUntil;

      expect(
        (
          await pause(cookie, enrollmentId, {
            pausedOn: today,
            plannedLastPausedOn: null,
          })
        ).status,
      ).toBe(200);

      const resumed = await resume(cookie, enrollmentId);
      expect(resumed.status).toBe(200);
      await expect(resumed.json()).resolves.toEqual({
        ok: true,
        daysAdded: 0,
        validUntil: until,
      });
    }, 20_000);

    it("returns not-paused when a dated pause already auto-finished", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const today = calendarDateInIst();
      const validFrom = addCalendarDays(today, -6);
      const pausedOn = addCalendarDays(today, -5);
      const plannedLast = addCalendarDays(today, -2);

      const db = getDb();
      const [player] = await db
        .insert(players)
        .values({
          academyId: academy.id,
          fullName: "Arjun Rao",
          fullNameNormalized: "arjun rao",
          phone: "+919876543210",
          dateOfBirth: "1990-06-15",
        })
        .returning({ id: players.id });
      const [enrollment] = await db
        .insert(enrollments)
        .values({
          academyId: academy.id,
          playerId: player.id,
          batchId: batch.id,
          daysPerWeek: 3,
          termDays: 45,
          feePaisePaid: 1_500_000,
          validFrom,
          validUntil: lastCoveredDay(validFrom, 45),
        })
        .returning({ id: enrollments.id, validUntil: enrollments.validUntil });
      await db.insert(enrollmentPauses).values({
        academyId: academy.id,
        enrollmentId: enrollment.id,
        pausedOn,
        plannedLastPausedOn: plannedLast,
      });

      const read = await getPlayer(academy.id, player.id, today);
      expect(read!.enrollments[0]!.status).toBe("active");

      const stale = await resume(cookie, enrollment.id);
      expect(stale.status).toBe(409);
      await expect(stale.json()).resolves.toEqual({ error: "not-paused" });

      const after = await getPlayer(academy.id, player.id, today);
      expect(after!.enrollments[0]).toMatchObject({
        status: "active",
        effectiveValidUntil: addCalendarDays(enrollment.validUntil, 4),
      });
    }, 20_000);

    it("isolates pause and resume across Academies", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();

      const created = await addPlayer(cookie, {
        ...adult,
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: today,
      });
      const { playerId } = (await created.json()) as { playerId: string };
      const detail = await getPlayer(academy.id, playerId, today);
      const enrollmentId = detail!.enrollments[0]!.id;

      const otherCookie = await signInOwner(otherEmail);
      await onboardOwner(otherCookie, otherSlug);

      const deniedPause = await pause(otherCookie, enrollmentId, {
        pausedOn: today,
        plannedLastPausedOn: null,
      });
      expect(deniedPause.status).toBe(404);
      await expect(deniedPause.json()).resolves.toEqual({ error: "not-found" });

      expect(
        (await pause(cookie, enrollmentId, {
          pausedOn: today,
          plannedLastPausedOn: null,
        })).status,
      ).toBe(200);

      const deniedResume = await resume(otherCookie, enrollmentId);
      expect(deniedResume.status).toBe(404);
      await expect(deniedResume.json()).resolves.toEqual({ error: "not-found" });
    }, 30_000);
  },
);
