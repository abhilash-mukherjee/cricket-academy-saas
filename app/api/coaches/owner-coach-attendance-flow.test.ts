import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as verifyAuth, POST as authPost } from "../auth/[...all]/route";
import { POST as completeOnboarding } from "../onboarding/route";
import { POST as startImpersonation } from "../admin/academies/[academyId]/impersonate/route";
import { POST as createBatch } from "../batches/route";
import { PATCH as patchBatch } from "../batches/[batchId]/route";
import {
  DELETE as discardSession,
  PUT as saveSession,
} from "../batches/[batchId]/sessions/[date]/route";
import { POST as createCoach } from "./route";
import { DELETE as deleteCoach } from "./[coachId]/route";
import { GET as readMonth } from "./[coachId]/attendance/route";
import {
  DELETE as clearMark,
  GET as readMark,
  PUT as putMark,
} from "./[coachId]/attendance/[batchId]/[markedOn]/route";
import {
  clearCapturedMail,
  disableMailCapture,
  enableMailCapture,
  extractFirstUrl,
  getCapturedMail,
} from "@/lib/mailer";
import {
  academies,
  batchSessionAttendance,
  batchSessions,
  batches,
  coachAttendance,
  coaches,
  impersonationAuditEvents,
} from "@/db/domain-schema";
import { user } from "@/db/auth-schema";
import { getDb } from "@/db/client";
import { addCalendarDays } from "@/lib/enrollment-term";
import { listBatches } from "@/lib/batches";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { calendarDateInIst } from "@/lib/player-age";

vi.setConfig({ testTimeout: 30_000 });

const sessionCookie = vi.hoisted(() => ({ value: "" }));
const cookieJar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  headers: async () => {
    const headers = new Headers();
    if (sessionCookie.value) {
      headers.set("cookie", sessionCookie.value);
    }
    for (const [name, value] of cookieJar) {
      const existing = headers.get("cookie");
      headers.set(
        "cookie",
        existing ? `${existing}; ${name}=${value}` : `${name}=${value}`,
      );
    }
    return headers;
  },
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

const hasDatabase = Boolean(process.env.DATABASE_URL);
const hasAuthSecret = Boolean(process.env.BETTER_AUTH_SECRET);
const origin = "http://localhost:3000";

async function signInOwner(email: string, name = "New Owner"): Promise<string> {
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

async function onboardOwner(cookie: string, slug: string, batchName: string) {
  const response = await completeOnboarding(
    new Request(`${origin}/api/onboarding`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie,
      },
      body: JSON.stringify({
        displayName: "Asha Rao",
        academyName: "Blitz Cricket Academy",
        slug,
        batchName,
      }),
    }),
  );
  expect(response.status).toBe(200);
}

async function sessionUserId(cookie: string): Promise<string> {
  const sessionResponse = await verifyAuth(
    new Request(`${origin}/api/auth/get-session`, {
      headers: { cookie, origin },
    }),
  );
  expect(sessionResponse.status).toBe(200);
  const body = (await sessionResponse.json()) as { user: { id: string } };
  return body.user.id;
}

function jsonHeaders(cookie: string) {
  return {
    "content-type": "application/json",
    origin,
    cookie,
  };
}

async function addCoach(cookie: string, name: string): Promise<string> {
  const response = await createCoach(
    new Request(`${origin}/api/coaches`, {
      method: "POST",
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ name }),
    }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function addBatch(cookie: string, name: string): Promise<string> {
  const response = await createBatch(
    new Request(`${origin}/api/batches`, {
      method: "POST",
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ name }),
    }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { id: string };
  return body.id;
}

function mark(
  cookie: string,
  coachId: string,
  batchId: string,
  markedOn: string,
  isPresent: boolean,
) {
  return putMark(
    new Request(
      `${origin}/api/coaches/${coachId}/attendance/${batchId}/${markedOn}`,
      {
        method: "PUT",
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ isPresent }),
      },
    ),
    { params: Promise.resolve({ coachId, batchId, markedOn }) },
  );
}

function clear(
  cookie: string,
  coachId: string,
  batchId: string,
  markedOn: string,
) {
  return clearMark(
    new Request(
      `${origin}/api/coaches/${coachId}/attendance/${batchId}/${markedOn}`,
      {
        method: "DELETE",
        headers: { origin, cookie },
      },
    ),
    { params: Promise.resolve({ coachId, batchId, markedOn }) },
  );
}

function oneMark(
  cookie: string,
  coachId: string,
  batchId: string,
  markedOn: string,
) {
  return readMark(
    new Request(
      `${origin}/api/coaches/${coachId}/attendance/${batchId}/${markedOn}`,
      { headers: { origin, cookie } },
    ),
    { params: Promise.resolve({ coachId, batchId, markedOn }) },
  );
}

function monthOf(
  cookie: string,
  coachId: string,
  batchId: string,
  month: string,
) {
  return readMonth(
    new Request(
      `${origin}/api/coaches/${coachId}/attendance?batchId=${batchId}&month=${month}`,
      { headers: { origin, cookie } },
    ),
    { params: Promise.resolve({ coachId }) },
  );
}

async function promoteSuperAdmin(email: string) {
  const db = getDb();
  await db
    .update(user)
    .set({ isSuperAdmin: true, emailVerified: true })
    .where(eq(user.email, email));
}

async function deleteOwnerByEmail(email: string) {
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
      .delete(coachAttendance)
      .where(eq(coachAttendance.academyId, academy.id));
    await db
      .delete(batchSessionAttendance)
      .where(eq(batchSessionAttendance.academyId, academy.id));
    await db
      .delete(batchSessions)
      .where(eq(batchSessions.academyId, academy.id));
    await db.delete(coaches).where(eq(coaches.academyId, academy.id));
    await db
      .delete(impersonationAuditEvents)
      .where(eq(impersonationAuditEvents.academyId, academy.id));
    await db.delete(batches).where(eq(batches.academyId, academy.id));
    await db.delete(academies).where(eq(academies.id, academy.id));
  }
  await db.delete(user).where(eq(user.email, email));
}

async function auditsFor(academyId: string) {
  const db = getDb();
  return db
    .select()
    .from(impersonationAuditEvents)
    .where(eq(impersonationAuditEvents.academyId, academyId))
    .orderBy(asc(impersonationAuditEvents.createdAt));
}

describe.skipIf(!hasDatabase || !hasAuthSecret)(
  "Owner Coach attendance at the HTTP seam",
  () => {
    const stamp = Date.now();
    const testEmail = `coach-attendance-${stamp}@example.com`;
    const otherEmail = `coach-attendance-other-${stamp}@example.com`;
    const superAdminEmail = `coach-attendance-super-${stamp}@example.com`;
    const slug = `coach-attendance-${stamp}`;
    const otherSlug = `coach-attendance-other-${stamp}`;

    beforeEach(() => {
      enableMailCapture();
      sessionCookie.value = "";
      cookieJar.clear();
    });

    afterEach(async () => {
      disableMailCapture();
      clearCapturedMail();
      sessionCookie.value = "";
      cookieJar.clear();
      await deleteOwnerByEmail(testEmail);
      await deleteOwnerByEmail(otherEmail);
      await deleteOwnerByEmail(superAdminEmail);
    });

    it("marks one Coach present for one Batch and absent for another, and two Coaches present for the same Batch", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const morningId = await addBatch(cookie, "Morning nets");
      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      const academyBatches = await listBatches(academy!.id);
      expect(academyBatches.map((batch) => batch.name)).toEqual([
        "U-14 evening",
        "Morning nets",
      ]);
      expect(
        academyBatches.every((batch) => batch.isOpenForRegistration === false),
      ).toBe(true);

      const eveningId = academyBatches[0].id;
      expect(morningId).toBe(academyBatches[1].id);
      const anilId = await addCoach(cookie, "Anil Mehta");
      const zaraId = await addCoach(cookie, "Zara Khan");
      const today = calendarDateInIst();

      const anilEvening = await mark(cookie, anilId, eveningId, today, true);
      expect(anilEvening.status).toBe(200);
      await expect(anilEvening.json()).resolves.toEqual({
        ok: true,
        changed: true,
      });

      const anilMorning = await mark(cookie, anilId, morningId, today, false);
      expect(anilMorning.status).toBe(200);
      await expect(anilMorning.json()).resolves.toEqual({
        ok: true,
        changed: true,
      });

      const zaraEvening = await mark(cookie, zaraId, eveningId, today, true);
      expect(zaraEvening.status).toBe(200);

      const anilEveningMark = await oneMark(cookie, anilId, eveningId, today);
      expect(anilEveningMark.status).toBe(200);
      await expect(anilEveningMark.json()).resolves.toEqual({
        isPresent: true,
      });
      const anilMorningMark = await oneMark(cookie, anilId, morningId, today);
      await expect(anilMorningMark.json()).resolves.toEqual({
        isPresent: false,
      });
      const zaraEveningMark = await oneMark(cookie, zaraId, eveningId, today);
      await expect(zaraEveningMark.json()).resolves.toEqual({
        isPresent: true,
      });

      sessionCookie.value = cookie;
      const { default: CoachPage } = await import(
        "@/app/app/coaches/[coachId]/page"
      );
      const html = renderToStaticMarkup(
        await CoachPage({ params: Promise.resolve({ coachId: anilId }) }),
      );
      const eveningAt = html.indexOf("U-14 evening");
      const morningAt = html.indexOf("Morning nets");
      expect(eveningAt).toBeGreaterThan(-1);
      expect(morningAt).toBeGreaterThan(eveningAt);
      expect(html).toContain('type="date"');
      expect(html).toContain(`value="${today}"`);
      expect(html).toContain('type="month"');
      expect(html).toContain(`value="${today.slice(0, 7)}"`);
      expect(html).toContain('href="/app/coaches"');
      expect(html).toContain("max-w-lg");
      expect(html).not.toContain("No mark");
    });

    it("replaces a mark, leaves the same value unchanged, and clears only a stored mark", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      const [batch] = await listBatches(academy!.id);
      const coachId = await addCoach(cookie, "Anil Mehta");
      const today = calendarDateInIst();

      const present = await mark(cookie, coachId, batch.id, today, true);
      await expect(present.json()).resolves.toEqual({
        ok: true,
        changed: true,
      });

      const absent = await mark(cookie, coachId, batch.id, today, false);
      expect(absent.status).toBe(200);
      await expect(absent.json()).resolves.toEqual({
        ok: true,
        changed: true,
      });
      const replaced = await oneMark(cookie, coachId, batch.id, today);
      await expect(replaced.json()).resolves.toEqual({ isPresent: false });

      const same = await mark(cookie, coachId, batch.id, today, false);
      expect(same.status).toBe(200);
      await expect(same.json()).resolves.toEqual({
        ok: true,
        changed: false,
      });
      const stillAbsent = await oneMark(cookie, coachId, batch.id, today);
      await expect(stillAbsent.json()).resolves.toEqual({ isPresent: false });

      const unmarked = await clear(cookie, coachId, batch.id, today);
      expect(unmarked.status).toBe(200);
      await expect(unmarked.json()).resolves.toEqual({
        ok: true,
        changed: true,
      });
      const cleared = await oneMark(cookie, coachId, batch.id, today);
      await expect(cleared.json()).resolves.toEqual({ isPresent: null });

      const alreadyClear = await clear(cookie, coachId, batch.id, today);
      expect(alreadyClear.status).toBe(200);
      await expect(alreadyClear.json()).resolves.toEqual({
        ok: true,
        changed: false,
      });
      const stillClear = await oneMark(cookie, coachId, batch.id, today);
      await expect(stillClear.json()).resolves.toEqual({ isPresent: null });
    });

    it("writes nothing for a future date and rejects an invalid date", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      const [batch] = await listBatches(academy!.id);
      const coachId = await addCoach(cookie, "Anil Mehta");
      const today = calendarDateInIst();
      const future = addCalendarDays(today, 1);

      const marked = await mark(cookie, coachId, batch.id, today, true);
      expect(marked.status).toBe(200);

      const futureMark = await mark(cookie, coachId, batch.id, future, false);
      expect(futureMark.status).toBe(400);
      await expect(futureMark.json()).resolves.toEqual({
        error: "future-date",
      });

      const futureClear = await clear(cookie, coachId, batch.id, future);
      expect(futureClear.status).toBe(400);
      await expect(futureClear.json()).resolves.toEqual({
        error: "future-date",
      });

      const futureRead = await oneMark(cookie, coachId, batch.id, future);
      expect(futureRead.status).toBe(200);
      await expect(futureRead.json()).resolves.toEqual({ isPresent: null });

      const invalid = await mark(cookie, coachId, batch.id, "2026-02-31", true);
      expect(invalid.status).toBe(400);
      await expect(invalid.json()).resolves.toEqual({ error: "invalid-input" });

      const stored = await oneMark(cookie, coachId, batch.id, today);
      await expect(stored.json()).resolves.toEqual({ isPresent: true });
    });

    it("reads one Batch's month, keeps marks when the Batch is renamed, and keeps them when a Session is discarded", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const morningId = await addBatch(cookie, "Morning nets");
      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      const academyBatches = await listBatches(academy!.id);
      const eveningId = academyBatches[0].id;
      const coachId = await addCoach(cookie, "Anil Mehta");
      const today = calendarDateInIst();
      const month = today.slice(0, 7);
      const monthStart = `${month}-01`;
      const previousDay = addCalendarDays(monthStart, -1);
      const [year, monthNumber] = month.split("-").map(Number);
      const futureMonthDate = new Date(Date.UTC(year, monthNumber - 1, 1));
      futureMonthDate.setUTCMonth(futureMonthDate.getUTCMonth() + 1);
      const futureMonth = futureMonthDate.toISOString().slice(0, 7);

      if (monthStart !== today) {
        const earlier = await mark(
          cookie,
          coachId,
          eveningId,
          monthStart,
          false,
        );
        expect(earlier.status).toBe(200);
      }
      const present = await mark(cookie, coachId, eveningId, today, true);
      expect(present.status).toBe(200);
      const otherBatch = await mark(cookie, coachId, morningId, today, true);
      expect(otherBatch.status).toBe(200);
      const previous = await mark(
        cookie,
        coachId,
        eveningId,
        previousDay,
        true,
      );
      expect(previous.status).toBe(200);

      const eveningMonth = await monthOf(cookie, coachId, eveningId, month);
      expect(eveningMonth.status).toBe(200);
      await expect(eveningMonth.json()).resolves.toEqual({
        presentDates: [today],
        absentDates: monthStart === today ? [] : [monthStart],
        presentCount: 1,
        absentCount: monthStart === today ? 0 : 1,
      });

      const morningMonth = await monthOf(cookie, coachId, morningId, month);
      await expect(morningMonth.json()).resolves.toEqual({
        presentDates: [today],
        absentDates: [],
        presentCount: 1,
        absentCount: 0,
      });

      const emptyFuture = await monthOf(
        cookie,
        coachId,
        eveningId,
        futureMonth,
      );
      expect(emptyFuture.status).toBe(200);
      await expect(emptyFuture.json()).resolves.toEqual({
        presentDates: [],
        absentDates: [],
        presentCount: 0,
        absentCount: 0,
      });

      const renamed = await patchBatch(
        new Request(`${origin}/api/batches/${eveningId}`, {
          method: "PATCH",
          headers: jsonHeaders(cookie),
          body: JSON.stringify({ name: "U-14 renamed" }),
        }),
        { params: Promise.resolve({ batchId: eveningId }) },
      );
      expect(renamed.status).toBe(200);

      const afterRename = await monthOf(cookie, coachId, eveningId, month);
      await expect(afterRename.json()).resolves.toEqual({
        presentDates: [today],
        absentDates: monthStart === today ? [] : [monthStart],
        presentCount: 1,
        absentCount: monthStart === today ? 0 : 1,
      });

      const saved = await saveSession(
        new Request(`${origin}/api/batches/${eveningId}/sessions/${today}`, {
          method: "PUT",
          headers: jsonHeaders(cookie),
          body: JSON.stringify({ playerIds: [], presentPlayerIds: [] }),
        }),
        { params: Promise.resolve({ batchId: eveningId, date: today }) },
      );
      expect(saved.status).toBe(200);

      const discarded = await discardSession(
        new Request(`${origin}/api/batches/${eveningId}/sessions/${today}`, {
          method: "DELETE",
          headers: { origin, cookie },
        }),
        { params: Promise.resolve({ batchId: eveningId, date: today }) },
      );
      expect(discarded.status).toBe(200);

      const afterDiscard = await monthOf(cookie, coachId, eveningId, month);
      await expect(afterDiscard.json()).resolves.toEqual({
        presentDates: [today],
        absentDates: monthStart === today ? [] : [monthStart],
        presentCount: 1,
        absentCount: monthStart === today ? 0 : 1,
      });
    });

    it("deletes the Coach's marks when the Coach is removed", async () => {
      const cookie = await signInOwner(testEmail);
      await onboardOwner(cookie, slug, "U-14 evening");
      const academy = await getOwnedAcademy(await sessionUserId(cookie));
      const [batch] = await listBatches(academy!.id);
      const coachId = await addCoach(cookie, "Anil Mehta");
      const today = calendarDateInIst();
      const month = today.slice(0, 7);

      const marked = await mark(cookie, coachId, batch.id, today, true);
      expect(marked.status).toBe(200);

      const removed = await deleteCoach(
        new Request(`${origin}/api/coaches/${coachId}`, {
          method: "DELETE",
          headers: { origin, cookie },
        }),
        { params: Promise.resolve({ coachId }) },
      );
      expect(removed.status).toBe(200);

      const gone = await monthOf(cookie, coachId, batch.id, month);
      expect(gone.status).toBe(404);
      const goneMark = await oneMark(cookie, coachId, batch.id, today);
      expect(goneMark.status).toBe(404);

      const againId = await addCoach(cookie, "Anil Mehta");
      const fresh = await monthOf(cookie, againId, batch.id, month);
      expect(fresh.status).toBe(200);
      await expect(fresh.json()).resolves.toEqual({
        presentDates: [],
        absentDates: [],
        presentCount: 0,
        absentCount: 0,
      });
    });

    it("audits an impersonated mark or clear only when the stored mark changes", async () => {
      const ownerCookie = await signInOwner(testEmail);
      await onboardOwner(ownerCookie, slug, "U-14 evening");
      const ownerId = await sessionUserId(ownerCookie);
      const academy = await getOwnedAcademy(ownerId);
      const [batch] = await listBatches(academy!.id);

      const superCookie = await signInOwner(superAdminEmail, "Super Admin");
      await promoteSuperAdmin(superAdminEmail);
      sessionCookie.value = superCookie;

      const impersonateResponse = await startImpersonation(
        new Request(
          `${origin}/api/admin/academies/${academy!.id}/impersonate`,
          {
            method: "POST",
            headers: { origin, cookie: superCookie },
          },
        ),
        { params: Promise.resolve({ academyId: academy!.id }) },
      );
      expect(impersonateResponse.status).toBe(200);

      const db = getDb();
      await db
        .delete(impersonationAuditEvents)
        .where(eq(impersonationAuditEvents.academyId, academy!.id));

      const coachId = await addCoach(superCookie, "Anil Mehta");
      await db
        .delete(impersonationAuditEvents)
        .where(eq(impersonationAuditEvents.academyId, academy!.id));

      const today = calendarDateInIst();
      const future = addCalendarDays(today, 1);

      const futureMark = await mark(
        superCookie,
        coachId,
        batch.id,
        future,
        true,
      );
      expect(futureMark.status).toBe(400);
      expect(await auditsFor(academy!.id)).toEqual([]);

      const emptyClear = await clear(superCookie, coachId, batch.id, today);
      await expect(emptyClear.json()).resolves.toEqual({
        ok: true,
        changed: false,
      });
      expect(await auditsFor(academy!.id)).toEqual([]);

      const present = await mark(superCookie, coachId, batch.id, today, true);
      await expect(present.json()).resolves.toEqual({
        ok: true,
        changed: true,
      });
      expect(await auditsFor(academy!.id)).toEqual([
        expect.objectContaining({
          action: "coach-attendance.mark",
          subjectUserId: ownerId,
          metadata: { coachId, batchId: batch.id, markedOn: today },
        }),
      ]);

      const same = await mark(superCookie, coachId, batch.id, today, true);
      await expect(same.json()).resolves.toEqual({
        ok: true,
        changed: false,
      });
      expect(await auditsFor(academy!.id)).toHaveLength(1);

      const absent = await mark(superCookie, coachId, batch.id, today, false);
      await expect(absent.json()).resolves.toEqual({
        ok: true,
        changed: true,
      });
      expect(await auditsFor(academy!.id)).toHaveLength(2);

      const cleared = await clear(superCookie, coachId, batch.id, today);
      await expect(cleared.json()).resolves.toEqual({
        ok: true,
        changed: true,
      });
      const afterClear = await auditsFor(academy!.id);
      expect(afterClear).toHaveLength(3);
      expect(afterClear[2]).toEqual(
        expect.objectContaining({
          action: "coach-attendance.clear",
          subjectUserId: ownerId,
          metadata: { coachId, batchId: batch.id, markedOn: today },
        }),
      );

      const clearAgain = await clear(superCookie, coachId, batch.id, today);
      await expect(clearAgain.json()).resolves.toEqual({
        ok: true,
        changed: false,
      });
      expect(await auditsFor(academy!.id)).toHaveLength(3);
    });

    it("does not let another Academy mark or read this Coach", async () => {
      const cookieA = await signInOwner(testEmail);
      await onboardOwner(cookieA, slug, "U-14 evening");
      const academyA = await getOwnedAcademy(await sessionUserId(cookieA));
      const [batch] = await listBatches(academyA!.id);
      const coachId = await addCoach(cookieA, "Anil Mehta");
      const today = calendarDateInIst();
      const month = today.slice(0, 7);

      const marked = await mark(cookieA, coachId, batch.id, today, true);
      expect(marked.status).toBe(200);

      const cookieB = await signInOwner(otherEmail, "Bala Sen");
      await onboardOwner(cookieB, otherSlug, "Weekend nets");

      const otherMark = await mark(cookieB, coachId, batch.id, today, false);
      expect(otherMark.status).toBe(404);
      const otherClear = await clear(cookieB, coachId, batch.id, today);
      expect(otherClear.status).toBe(404);
      const otherRead = await oneMark(cookieB, coachId, batch.id, today);
      expect(otherRead.status).toBe(404);
      const otherMonth = await monthOf(cookieB, coachId, batch.id, month);
      expect(otherMonth.status).toBe(404);

      const stored = await oneMark(cookieA, coachId, batch.id, today);
      await expect(stored.json()).resolves.toEqual({ isPresent: true });
    });
  },
);
