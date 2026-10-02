import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { GET as verifyAuth, POST as authPost } from "../auth/[...all]/route";
import { POST as completeOnboarding } from "../onboarding/route";
import { POST as createBatch } from "../batches/route";
import { PATCH as patchBatch } from "../batches/[batchId]/route";
import { POST as createFeeOption } from "../batches/[batchId]/fee-options/route";
import { PATCH as patchFeeOption } from "../batches/[batchId]/fee-options/[feeOptionId]/route";
import { POST as postRegistration } from "../a/[academySlug]/registrations/route";
import { POST as acceptRegistration } from "../registrations/[registrationId]/accept/route";
import { POST as manualAdd } from "./route";
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
import { lastCoveredDay } from "@/lib/enrollment-term";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { listBatches } from "@/lib/batches";

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

function addPlayer(cookie: string, body: Record<string, unknown>) {
  return manualAdd(
    new Request(`${origin}/api/players`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, cookie },
      body: JSON.stringify(body),
    }),
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

const child = {
  playerFullName: "Mini Rao",
  playerDateOfBirth: "2015-06-15",
  guardianFullName: "Asha Rao",
  guardianPhone: "9876543210",
  contactEmail: "guardian@example.com",
};

describe.skipIf(!hasDatabase || !hasAuthSecret)(
  "Owner manual add Player + Enrollment at the HTTP seam",
  () => {
    const stamp = Date.now();
    const ownerEmail = `manual-add-owner-${stamp}@example.com`;
    const otherEmail = `manual-add-other-${stamp}@example.com`;
    const slug = `manual-add-${stamp}`;
    const otherSlug = `manual-add-other-${stamp}`;

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

    it("creates a Player and Enrollment with no Registration", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id, {
        termDays: 45,
        feeInr: 15000,
      });
      const today = calendarDateInIst();

      const response = await addPlayer(cookie, {
        ...adult,
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: today,
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: true; playerId: string };
      expect(body.ok).toBe(true);

      const db = getDb();
      const [player] = await db
        .select()
        .from(players)
        .where(eq(players.id, body.playerId));
      expect(player).toMatchObject({
        fullName: "Arjun Rao",
        phone: "+919876543210",
        dateOfBirth: "1990-06-15",
        email: "arjun@example.com",
        guardianFullName: null,
        guardianPhone: null,
      });
      const [enrollment] = await db
        .select()
        .from(enrollments)
        .where(eq(enrollments.academyId, academy.id));
      expect(enrollment).toMatchObject({
        playerId: player.id,
        batchId: batch.id,
        registrationId: null,
        daysPerWeek: 3,
        termDays: 45,
        feePaisePaid: 1_500_000,
        validFrom: today,
        validUntil: lastCoveredDay(today, 45),
        renewedFromEnrollmentId: null,
      });
      const regs = await db
        .select()
        .from(registrations)
        .where(eq(registrations.academyId, academy.id));
      expect(regs).toHaveLength(0);
    }, 20_000);

    it("copies Guardian on under-18 create", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();

      const response = await addPlayer(cookie, {
        ...child,
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: today,
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { playerId: string };

      const db = getDb();
      const [player] = await db
        .select()
        .from(players)
        .where(eq(players.id, body.playerId));
      expect(player).toMatchObject({
        fullName: "Mini Rao",
        phone: "+919876543210",
        dateOfBirth: "2015-06-15",
        guardianFullName: "Asha Rao",
        guardianPhone: "+919876543210",
        email: "guardian@example.com",
      });
    }, 20_000);

    it("links an existing Player and keeps Guardian and email", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();

      const first = await addPlayer(cookie, {
        ...child,
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: today,
      });
      expect(first.status).toBe(200);
      const firstBody = (await first.json()) as { playerId: string };

      const secondBatch = await createBatch(
        new Request(`${origin}/api/batches`, {
          method: "POST",
          headers: { "content-type": "application/json", origin, cookie },
          body: JSON.stringify({ name: "U-16 morning" }),
        }),
      );
      expect(secondBatch.status).toBe(200);
      const secondBatchBody = (await secondBatch.json()) as { id: string };
      const secondFee = await openBatch(cookie, secondBatchBody.id, {
        termDays: 30,
        feeInr: 8000,
      });

      const linked = await addPlayer(cookie, {
        playerFullName: "Mini Rao",
        playerDateOfBirth: "2014-01-01",
        guardianFullName: "Other Guardian",
        guardianPhone: "9876543210",
        contactEmail: "other@example.com",
        batchId: secondBatchBody.id,
        batchFeeOptionId: secondFee,
        validFrom: today,
      });
      expect(linked.status).toBe(200);
      const linkedBody = (await linked.json()) as { playerId: string };
      expect(linkedBody.playerId).toBe(firstBody.playerId);

      const db = getDb();
      const roster = await db
        .select()
        .from(players)
        .where(eq(players.academyId, academy.id));
      expect(roster).toHaveLength(1);
      expect(roster[0]).toMatchObject({
        fullName: "Mini Rao",
        dateOfBirth: "2015-06-15",
        guardianFullName: "Asha Rao",
        guardianPhone: "+919876543210",
        email: "guardian@example.com",
      });
    }, 20_000);

    it("accept and manual add copy email fill-if-empty only", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();

      const submitted = await postRegistration(
        new Request(`${origin}/api/a/${slug}/registrations`, {
          method: "POST",
          headers: { "content-type": "application/json", origin },
          body: JSON.stringify({
            batchFeeOptionId: feeOptionId,
            ...adult,
          }),
        }),
        { params: Promise.resolve({ academySlug: slug }) },
      );
      expect(submitted.status).toBe(200);

      const db = getDb();
      const [registration] = await db
        .select({ id: registrations.id })
        .from(registrations)
        .where(
          and(
            eq(registrations.academyId, academy.id),
            eq(registrations.status, "pending"),
          ),
        )
        .limit(1);

      const accepted = await acceptRegistration(
        new Request(`${origin}/api/registrations/${registration.id}/accept`, {
          method: "POST",
          headers: { "content-type": "application/json", origin, cookie },
          body: JSON.stringify({ validFrom: today }),
        }),
        { params: Promise.resolve({ registrationId: registration.id }) },
      );
      expect(accepted.status).toBe(200);

      const [afterAccept] = await db
        .select({ email: players.email, id: players.id })
        .from(players)
        .where(eq(players.academyId, academy.id));
      expect(afterAccept.email).toBe("arjun@example.com");

      const secondBatch = await createBatch(
        new Request(`${origin}/api/batches`, {
          method: "POST",
          headers: { "content-type": "application/json", origin, cookie },
          body: JSON.stringify({ name: "U-16 morning" }),
        }),
      );
      const secondBatchBody = (await secondBatch.json()) as { id: string };
      const secondFee = await openBatch(cookie, secondBatchBody.id);

      const linked = await addPlayer(cookie, {
        ...adult,
        contactEmail: "newer@example.com",
        batchId: secondBatchBody.id,
        batchFeeOptionId: secondFee,
        validFrom: today,
      });
      expect(linked.status).toBe(200);

      const [afterLink] = await db
        .select({ email: players.email })
        .from(players)
        .where(eq(players.id, afterAccept.id));
      expect(afterLink.email).toBe("arjun@example.com");

      await db
        .update(players)
        .set({ email: null })
        .where(eq(players.id, afterAccept.id));

      const thirdBatch = await createBatch(
        new Request(`${origin}/api/batches`, {
          method: "POST",
          headers: { "content-type": "application/json", origin, cookie },
          body: JSON.stringify({ name: "U-18 nets" }),
        }),
      );
      const thirdBatchBody = (await thirdBatch.json()) as { id: string };
      const thirdFee = await openBatch(cookie, thirdBatchBody.id);

      const filled = await addPlayer(cookie, {
        ...adult,
        contactEmail: "filled@example.com",
        batchId: thirdBatchBody.id,
        batchFeeOptionId: thirdFee,
        validFrom: today,
      });
      expect(filled.status).toBe(200);
      const [afterFill] = await db
        .select({ email: players.email })
        .from(players)
        .where(eq(players.id, afterAccept.id));
      expect(afterFill.email).toBe("filled@example.com");
    }, 30_000);

    it("adds Enrollment for an existing Player on the detail path", async () => {
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
      const createdBody = (await created.json()) as { playerId: string };

      const secondBatch = await createBatch(
        new Request(`${origin}/api/batches`, {
          method: "POST",
          headers: { "content-type": "application/json", origin, cookie },
          body: JSON.stringify({ name: "U-16 morning" }),
        }),
      );
      const secondBatchBody = (await secondBatch.json()) as { id: string };
      const secondFee = await openBatch(cookie, secondBatchBody.id, {
        termDays: 30,
        feeInr: 8000,
      });

      const enrolled = await addPlayer(cookie, {
        playerId: createdBody.playerId,
        batchId: secondBatchBody.id,
        batchFeeOptionId: secondFee,
        validFrom: today,
      });
      expect(enrolled.status).toBe(200);

      const db = getDb();
      const placed = await db
        .select({
          batchId: enrollments.batchId,
          registrationId: enrollments.registrationId,
          termDays: enrollments.termDays,
        })
        .from(enrollments)
        .where(eq(enrollments.playerId, createdBody.playerId));
      expect(placed).toHaveLength(2);
      expect(
        placed.find((row) => row.batchId === secondBatchBody.id),
      ).toMatchObject({
        registrationId: null,
        termDays: 30,
      });
      expect(
        await db
          .select()
          .from(players)
          .where(eq(players.academyId, academy.id)),
      ).toHaveLength(1);
    }, 20_000);

    it("allows a stopped fee option and rejects overlap without writing", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();

      const first = await addPlayer(cookie, {
        ...adult,
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: today,
      });
      expect(first.status).toBe(200);

      const closed = await patchBatch(
        new Request(`${origin}/api/batches/${batch.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", origin, cookie },
          body: JSON.stringify({ isOpenForRegistration: false }),
        }),
        { params: Promise.resolve({ batchId: batch.id }) },
      );
      expect(closed.status).toBe(200);

      const stopped = await patchFeeOption(
        new Request(
          `${origin}/api/batches/${batch.id}/fee-options/${feeOptionId}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json", origin, cookie },
            body: JSON.stringify({ isOffered: false }),
          },
        ),
        { params: Promise.resolve({ batchId: batch.id, feeOptionId }) },
      );
      expect(stopped.status).toBe(200);

      const overlapped = await addPlayer(cookie, {
        ...adult,
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: today,
      });
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

      const secondBatch = await createBatch(
        new Request(`${origin}/api/batches`, {
          method: "POST",
          headers: { "content-type": "application/json", origin, cookie },
          body: JSON.stringify({ name: "U-16 morning" }),
        }),
      );
      const secondBatchBody = (await secondBatch.json()) as { id: string };
      const secondFee = await openBatch(cookie, secondBatchBody.id);

      // Pause blocks new Enrollment on the same Batch only; use same batch.
      const paused = await addPlayer(cookie, {
        ...adult,
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: today,
      });
      expect(paused.status).toBe(409);
      await expect(paused.json()).resolves.toEqual({ error: "paused" });

      expect(
        await db
          .select()
          .from(enrollments)
          .where(eq(enrollments.academyId, academy.id)),
      ).toHaveLength(1);

      // Sanity: other Batch still accepts while pause is open on the first.
      const other = await addPlayer(cookie, {
        ...adult,
        batchId: secondBatchBody.id,
        batchFeeOptionId: secondFee,
        validFrom: today,
      });
      expect(other.status).toBe(200);
    }, 30_000);

    it("isolates the write path across Academies", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await academyFor(cookie);
      const [batch] = await listBatches(academy.id);
      const feeOptionId = await openBatch(cookie, batch.id);
      const today = calendarDateInIst();

      const otherCookie = await signInOwner(otherEmail);
      await onboardOwner(otherCookie, otherSlug);

      const denied = await addPlayer(otherCookie, {
        ...adult,
        batchId: batch.id,
        batchFeeOptionId: feeOptionId,
        validFrom: today,
      });
      expect(denied.status).toBe(404);
      await expect(denied.json()).resolves.toEqual({ error: "not-found" });

      const db = getDb();
      expect(
        await db
          .select()
          .from(players)
          .where(eq(players.academyId, academy.id)),
      ).toHaveLength(0);
    }, 20_000);
  },
);
