import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as verifyAuth, POST as authPost } from "../auth/[...all]/route";
import { POST as completeOnboarding } from "../onboarding/route";
import { POST as createFeeOption } from "./[batchId]/fee-options/route";
import { PATCH as patchBatch } from "./[batchId]/route";
import { POST as manualAdd } from "../players/route";
import { POST as pauseEnrollment } from "../enrollments/[enrollmentId]/pause/route";
import { DELETE as discardSession, PUT as saveSession } from "./[batchId]/sessions/[date]/route";
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
  batchSessionAttendance,
  batchSessions,
  batches,
  enrollmentPauses,
  enrollments,
  players,
  registrations,
} from "@/db/domain-schema";
import { user } from "@/db/auth-schema";
import { getDb } from "@/db/client";
import { getSessionAttendance } from "@/lib/batch-sessions";
import { addCalendarDays } from "@/lib/enrollment-term";
import { calendarDateInIst } from "@/lib/player-age";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { getPlayer } from "@/lib/players";
import { listBatches } from "@/lib/batches";

const sessionCookie = vi.hoisted(() => ({ value: "" }));

vi.setConfig({ testTimeout: 30_000 });

vi.mock("next/headers", () => ({
  headers: async () => {
    const headers = new Headers();
    if (sessionCookie.value) {
      headers.set("cookie", sessionCookie.value);
    }
    return headers;
  },
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({
      refresh: () => undefined,
      push: () => undefined,
      replace: () => undefined,
      prefetch: () => undefined,
      back: () => undefined,
      forward: () => undefined,
    }),
  };
});

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    connection: async () => undefined,
  };
});

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

function save(
  cookie: string,
  batchId: string,
  date: string,
  body: Record<string, unknown>,
) {
  return saveSession(
    new Request(`${origin}/api/batches/${batchId}/sessions/${date}`, {
      method: "PUT",
      headers: { "content-type": "application/json", origin, cookie },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ batchId, date }) },
  );
}

function discard(cookie: string, batchId: string, date: string) {
  return discardSession(
    new Request(`${origin}/api/batches/${batchId}/sessions/${date}`, {
      method: "DELETE",
      headers: { origin, cookie },
    }),
    { params: Promise.resolve({ batchId, date }) },
  );
}

function marks(
  playersOnList: { fullName: string; isPresent: boolean }[],
): Record<string, boolean> {
  return Object.fromEntries(
    playersOnList.map((player) => [player.fullName, player.isPresent]),
  );
}

function presentTag(html: string, fullName: string): string {
  const needle = `aria-label="Present: ${fullName}"`;
  const start = html.indexOf(needle);
  expect(start).toBeGreaterThanOrEqual(0);
  const tagStart = html.lastIndexOf("<input", start);
  const tagEnd = html.indexOf(">", start);
  return html.slice(tagStart, tagEnd + 1);
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
      .delete(batchSessionAttendance)
      .where(eq(batchSessionAttendance.academyId, academy.id));
    await db
      .delete(batchSessions)
      .where(eq(batchSessions.academyId, academy.id));
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
  "Owner Session attendance at the HTTP seam",
  () => {
    const stamp = Date.now();
    const ownerEmail = `session-owner-${stamp}@example.com`;
    const otherEmail = `session-other-${stamp}@example.com`;
    const slug = `session-${stamp}`;
    const otherSlug = `session-other-${stamp}`;

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

    it("saves present and absent, rejects a stale list, and discard restores the live list", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();

      async function enroll(fullName: string, phone: string) {
        const created = await addPlayer(cookie, {
          playerFullName: fullName,
          playerDateOfBirth: "1990-06-15",
          playerPhone: phone,
          batchId: batch.id,
          batchFeeOptionId: feeOptionId,
          validFrom: today,
        });
        expect(created.status).toBe(200);
        return ((await created.json()) as { playerId: string }).playerId;
      }

      const arjunId = await enroll("Arjun Rao", "9876543210");
      const meeraId = await enroll("Meera Shah", "9876543211");

      const shown = await getSessionAttendance(
        academy.id,
        batch.id,
        today,
        today,
      );
      expect(shown!.saved).toBe(false);
      expect(shown!.players.map((player) => player.fullName)).toEqual([
        "Arjun Rao",
        "Meera Shah",
      ]);
      expect(marks(shown!.players)).toEqual({
        "Arjun Rao": false,
        "Meera Shah": false,
      });

      sessionCookie.value = cookie;
      const { default: RosterPage } = await import(
        "@/app/app/batches/[batchId]/page"
      );
      const { default: SessionsPage } = await import(
        "@/app/app/batches/[batchId]/sessions/page"
      );
      const { default: PlayerPage } = await import(
        "@/app/app/players/[playerId]/page"
      );
      const roster = renderToStaticMarkup(
        await RosterPage({
          params: Promise.resolve({ batchId: batch.id }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(roster).toContain(`href="/app/batches/${batch.id}/sessions"`);

      const beforeSave = renderToStaticMarkup(
        await SessionsPage({
          params: Promise.resolve({ batchId: batch.id }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(beforeSave).toContain("Unchecked Players are absent.");
      expect(beforeSave).toContain(
        `href="/app/players/${arjunId}?fromBatch=${batch.id}&amp;sessionDate=${today}"`,
      );
      expect(presentTag(beforeSave, "Arjun Rao")).not.toContain("checked");
      expect(presentTag(beforeSave, "Meera Shah")).not.toContain("checked");

      const playerPage = renderToStaticMarkup(
        await PlayerPage({
          params: Promise.resolve({ playerId: arjunId }),
          searchParams: Promise.resolve({
            fromBatch: batch.id,
            sessionDate: today,
          }),
        }),
      );
      expect(playerPage).toContain(
        `href="/app/batches/${batch.id}/sessions?date=${today}"`,
      );

      const saved = await save(cookie, batch.id, today, {
        playerIds: [arjunId, meeraId],
        presentPlayerIds: [arjunId],
      });
      expect(saved.status).toBe(200);
      const afterSave = await getSessionAttendance(
        academy.id,
        batch.id,
        today,
        today,
      );
      expect(afterSave!.saved).toBe(true);
      expect(marks(afterSave!.players)).toEqual({
        "Arjun Rao": true,
        "Meera Shah": false,
      });

      const savedHtml = renderToStaticMarkup(
        await SessionsPage({
          params: Promise.resolve({ batchId: batch.id }),
          searchParams: Promise.resolve({ date: today }),
        }),
      );
      expect(savedHtml).toContain(
        "This list is fixed. Discard rebuilds it from current Enrollments.",
      );
      expect(presentTag(savedHtml, "Arjun Rao")).toContain("checked");
      expect(presentTag(savedHtml, "Meera Shah")).not.toContain("checked");
      expect(savedHtml).toContain("1 of 2 present");

      const kabirId = await enroll("Kabir Sen", "9876543212");
      const stillFixed = await getSessionAttendance(
        academy.id,
        batch.id,
        today,
        today,
      );
      expect(stillFixed!.players.map((player) => player.fullName)).toEqual([
        "Arjun Rao",
        "Meera Shah",
      ]);

      const stale = await save(cookie, batch.id, today, {
        playerIds: [arjunId, meeraId, kabirId],
        presentPlayerIds: [arjunId],
      });
      expect(stale.status).toBe(409);
      await expect(stale.json()).resolves.toEqual({ error: "stale-list" });
      const unchanged = await getSessionAttendance(
        academy.id,
        batch.id,
        today,
        today,
      );
      expect(marks(unchanged!.players)).toEqual({
        "Arjun Rao": true,
        "Meera Shah": false,
      });

      const notSubset = await save(cookie, batch.id, today, {
        playerIds: [arjunId, meeraId],
        presentPlayerIds: [arjunId, kabirId],
      });
      expect(notSubset.status).toBe(400);
      await expect(notSubset.json()).resolves.toEqual({
        error: "invalid-input",
      });

      const flipped = await save(cookie, batch.id, today, {
        playerIds: [meeraId, arjunId],
        presentPlayerIds: [meeraId],
      });
      expect(flipped.status).toBe(200);
      const flippedList = await getSessionAttendance(
        academy.id,
        batch.id,
        today,
        today,
      );
      expect(marks(flippedList!.players)).toEqual({
        "Arjun Rao": false,
        "Meera Shah": true,
      });

      const removed = await discard(cookie, batch.id, today);
      expect(removed.status).toBe(200);
      const live = await getSessionAttendance(
        academy.id,
        batch.id,
        today,
        today,
      );
      expect(live!.saved).toBe(false);
      expect(live!.players.map((player) => player.fullName)).toEqual([
        "Arjun Rao",
        "Kabir Sen",
        "Meera Shah",
      ]);
      expect(marks(live!.players)).toEqual({
        "Arjun Rao": false,
        "Kabir Sen": false,
        "Meera Shah": false,
      });
    });

    it("leaves a paused Player off the list and stores only the eligible ids", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();

      const paused = await addPlayer(cookie, {
        playerFullName: "Arjun Rao",
        playerDateOfBirth: "1990-06-15",
        playerPhone: "9876543210",
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: today,
      });
      expect(paused.status).toBe(200);
      const pausedId = ((await paused.json()) as { playerId: string }).playerId;
      const detail = await getPlayer(academy.id, pausedId, today);
      const enrollmentId = detail!.enrollments[0]!.id;
      const pause = await pauseEnrollment(
        new Request(`${origin}/api/enrollments/${enrollmentId}/pause`, {
          method: "POST",
          headers: { "content-type": "application/json", origin, cookie },
          body: JSON.stringify({ pausedOn: today, plannedLastPausedOn: null }),
        }),
        { params: Promise.resolve({ enrollmentId }) },
      );
      expect(pause.status).toBe(200);

      const active = await addPlayer(cookie, {
        playerFullName: "Meera Shah",
        playerDateOfBirth: "1990-06-15",
        playerPhone: "9876543211",
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: today,
      });
      expect(active.status).toBe(200);
      const activeId = ((await active.json()) as { playerId: string }).playerId;

      const list = await getSessionAttendance(
        academy.id,
        batch.id,
        today,
        today,
      );
      expect(list!.pausedPlayersOmitted).toBe(true);
      expect(list!.players.map((player) => player.fullName)).toEqual([
        "Meera Shah",
      ]);

      sessionCookie.value = cookie;
      const { default: SessionsPage } = await import(
        "@/app/app/batches/[batchId]/sessions/page"
      );
      const html = renderToStaticMarkup(
        await SessionsPage({
          params: Promise.resolve({ batchId: batch.id }),
          searchParams: Promise.resolve({ date: today }),
        }),
      );
      expect(html).toContain("Paused Players are not listed.");
      expect(html).not.toContain("Arjun Rao");

      const stored = await save(cookie, batch.id, today, {
        playerIds: [activeId],
        presentPlayerIds: [activeId],
      });
      expect(stored.status).toBe(200);
      const attendance = await getSessionAttendance(
        academy.id,
        batch.id,
        today,
        today,
      );
      expect(attendance!.players.map((player) => player.playerId)).toEqual([
        activeId,
      ]);
      expect(attendance!.players[0]!.isPresent).toBe(true);

      const stale = await save(cookie, batch.id, today, {
        playerIds: [activeId, pausedId],
        presentPlayerIds: [activeId],
      });
      expect(stale.status).toBe(409);
      await expect(stale.json()).resolves.toEqual({ error: "stale-list" });
    });

    it("notes a paused Player left off a date after valid-until", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();
      const validFrom = addCalendarDays(today, -10);

      const created = await addPlayer(cookie, {
        playerFullName: "Arjun Rao",
        playerDateOfBirth: "1990-06-15",
        playerPhone: "9876543210",
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom,
      });
      expect(created.status).toBe(200);
      const playerId = ((await created.json()) as { playerId: string }).playerId;
      const detail = await getPlayer(academy.id, playerId, today);
      const enrollmentId = detail!.enrollments[0]!.id;
      const paused = await pauseEnrollment(
        new Request(`${origin}/api/enrollments/${enrollmentId}/pause`, {
          method: "POST",
          headers: { "content-type": "application/json", origin, cookie },
          body: JSON.stringify({
            pausedOn: addCalendarDays(today, -2),
            plannedLastPausedOn: addCalendarDays(today, 5),
          }),
        }),
        { params: Promise.resolve({ enrollmentId }) },
      );
      expect(paused.status).toBe(200);
      await getDb()
        .update(enrollments)
        .set({ validUntil: addCalendarDays(today, -1) })
        .where(eq(enrollments.id, enrollmentId));

      const list = await getSessionAttendance(
        academy.id,
        batch.id,
        today,
        today,
      );
      expect(list!.pausedPlayersOmitted).toBe(true);
      expect(list!.players).toEqual([]);

      sessionCookie.value = cookie;
      const { default: SessionsPage } = await import(
        "@/app/app/batches/[batchId]/sessions/page"
      );
      const html = renderToStaticMarkup(
        await SessionsPage({
          params: Promise.resolve({ batchId: batch.id }),
          searchParams: Promise.resolve({ date: today }),
        }),
      );
      expect(html).toContain("Paused Players are not listed.");
      expect(html).not.toContain("Arjun Rao");
    });

    it("does not let another Academy read or change the Session", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();
      const created = await addPlayer(cookie, {
        playerFullName: "Arjun Rao",
        playerDateOfBirth: "1990-06-15",
        playerPhone: "9876543210",
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: today,
      });
      const playerId = ((await created.json()) as { playerId: string }).playerId;
      const saved = await save(cookie, batch.id, today, {
        playerIds: [playerId],
        presentPlayerIds: [playerId],
      });
      expect(saved.status).toBe(200);

      const otherCookie = await signInOwner(otherEmail);
      await onboardOwner(otherCookie, otherSlug);
      const other = await academyFor(otherCookie);

      const deniedSave = await save(otherCookie, batch.id, today, {
        playerIds: [playerId],
        presentPlayerIds: [],
      });
      expect(deniedSave.status).toBe(404);
      await expect(deniedSave.json()).resolves.toEqual({ error: "not-found" });

      const deniedDiscard = await discard(otherCookie, batch.id, today);
      expect(deniedDiscard.status).toBe(404);

      expect(
        await getSessionAttendance(other.id, batch.id, today, today),
      ).toBeNull();
      const stillThere = await getSessionAttendance(
        academy.id,
        batch.id,
        today,
        today,
      );
      expect(stillThere!.players[0]!.isPresent).toBe(true);

      sessionCookie.value = otherCookie;
      const { default: SessionsPage } = await import(
        "@/app/app/batches/[batchId]/sessions/page"
      );
      await expect(
        SessionsPage({
          params: Promise.resolve({ batchId: batch.id }),
          searchParams: Promise.resolve({ date: today }),
        }),
      ).rejects.toThrow();
    });

    it("rejects a future date and can save an empty list", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();
      const tomorrow = addCalendarDays(today, 1);

      const future = await save(cookie, batch.id, tomorrow, {
        playerIds: [],
        presentPlayerIds: [],
      });
      expect(future.status).toBe(400);
      await expect(future.json()).resolves.toEqual({ error: "session-date" });

      sessionCookie.value = cookie;
      const { default: SessionsPage } = await import(
        "@/app/app/batches/[batchId]/sessions/page"
      );
      const badDate = renderToStaticMarkup(
        await SessionsPage({
          params: Promise.resolve({ batchId: batch.id }),
          searchParams: Promise.resolve({ date: "2026-02-31" }),
        }),
      );
      expect(badDate).toContain("Choose today or an earlier date.");
      expect(badDate).toContain("Open today");
      expect(badDate).not.toContain(">Save<");

      const empty = await save(cookie, batch.id, today, {
        playerIds: [],
        presentPlayerIds: [],
      });
      expect(empty.status).toBe(200);
      const savedEmpty = await getSessionAttendance(
        academy.id,
        batch.id,
        today,
        today,
      );
      expect(savedEmpty!.saved).toBe(true);
      expect(savedEmpty!.players).toEqual([]);

      const created = await addPlayer(cookie, {
        playerFullName: "Arjun Rao",
        playerDateOfBirth: "1990-06-15",
        playerPhone: "9876543210",
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: today,
      });
      expect(created.status).toBe(200);
      const stillEmpty = await getSessionAttendance(
        academy.id,
        batch.id,
        today,
        today,
      );
      expect(stillEmpty!.players).toEqual([]);

      const html = renderToStaticMarkup(
        await SessionsPage({
          params: Promise.resolve({ batchId: batch.id }),
          searchParams: Promise.resolve({ date: today }),
        }),
      );
      expect(html).toContain("Nobody on this Session");

      const removed = await discard(cookie, batch.id, today);
      expect(removed.status).toBe(200);
      const live = await getSessionAttendance(
        academy.id,
        batch.id,
        today,
        today,
      );
      expect(live!.saved).toBe(false);
      expect(live!.players.map((player) => player.fullName)).toEqual([
        "Arjun Rao",
      ]);
    });

    it("leaves a Player who starts later off the list and says so", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();

      const later = await addPlayer(cookie, {
        playerFullName: "Later Rao",
        playerDateOfBirth: "1990-06-15",
        playerPhone: "9876543210",
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: addCalendarDays(today, 8),
      });
      expect(later.status).toBe(200);
      const active = await addPlayer(cookie, {
        playerFullName: "Meera Shah",
        playerDateOfBirth: "1990-06-15",
        playerPhone: "9876543211",
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: today,
      });
      expect(active.status).toBe(200);

      const list = await getSessionAttendance(
        academy.id,
        batch.id,
        today,
        today,
      );
      expect(list!.deferredStartsOmitted).toBe(true);
      expect(list!.pausedPlayersOmitted).toBe(false);
      expect(list!.players.map((player) => player.fullName)).toEqual([
        "Meera Shah",
      ]);

      sessionCookie.value = cookie;
      const { default: SessionsPage } = await import(
        "@/app/app/batches/[batchId]/sessions/page"
      );
      const html = renderToStaticMarkup(
        await SessionsPage({
          params: Promise.resolve({ batchId: batch.id }),
          searchParams: Promise.resolve({ date: today }),
        }),
      );
      expect(html).toContain("Players who start later are not listed.");
      expect(html).not.toContain("Paused Players are not listed.");
      expect(html).not.toContain("Later Rao");
    });
  },
);
