import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createElement } from "react";
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
import { formatCalendarDate } from "@/lib/format-date";
import { calendarDateInIst } from "@/lib/player-age";
import { getOwnedAcademy } from "@/lib/owner-onboarding";
import { listBatches } from "@/lib/batches";
import EnrollmentStatus from "../enrollment-status";
import { resumeConfirmCopy } from "./player-enrollment-list";

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

async function ownerAcademy(cookie: string) {
  const session = await verifyAuth(
    new Request(`${origin}/api/auth/get-session`, {
      headers: { cookie, origin },
    }),
  );
  const body = (await session.json()) as { user: { id: string } };
  return (await getOwnedAcademy(body.user.id))!;
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

describe.skipIf(!hasDatabase || !hasAuthSecret)(
  "Owner Player directory at the App Router seam",
  () => {
    const stamp = Date.now();
    const ownerEmail = `players-owner-${stamp}@example.com`;
    const otherEmail = `players-other-${stamp}@example.com`;
    const slug = `players-${stamp}`;
    const otherSlug = `players-other-${stamp}`;

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

    it("shows an empty directory and a Players menu link", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      sessionCookie.value = cookie;

      const { default: PlayersPage } = await import("./page");
      const { AppChrome } = await import("../layout");
      const html = renderToStaticMarkup(
        createElement(
          "div",
          null,
          await AppChrome(),
          await PlayersPage({
            searchParams: Promise.resolve({}),
          }),
        ),
      );

      expect(html).toContain("Players");
      expect(html).toContain('href="/app/players"');
      expect(html).toContain("No Players yet.");
      expect(html).toContain("Add Player");
    });

    it("offers All, Paused, Lapsed, and Starts later, and names an empty cut", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      sessionCookie.value = cookie;
      const { default: PlayersPage } = await import("./page");

      const all = renderToStaticMarkup(
        await PlayersPage({ searchParams: Promise.resolve({}) }),
      );
      expect(all).toContain("No Players yet.");
      expect(all).toContain("Add Player");
      expect(all).toMatch(/aria-current="page"[^>]*>All</);
      expect(all).toMatch(/btn-active[^>]*>All</);
      expect(all.match(/btn-active/g)).toHaveLength(1);
      expect(all).toMatch(/href="\/app\/players"[^>]*>All</);
      expect(all).toContain('href="/app/players?status=paused"');
      expect(all).toContain('href="/app/players?status=lapsed"');
      expect(all).toContain('href="/app/players?status=starts-later"');
      expect(all).not.toContain("status=all");
      const pausedAt = all.indexOf('href="/app/players?status=paused"');
      const lapsedAt = all.indexOf('href="/app/players?status=lapsed"');
      const startsLaterAt = all.indexOf(
        'href="/app/players?status=starts-later"',
      );
      expect(lapsedAt).toBeGreaterThan(pausedAt);
      expect(startsLaterAt).toBeGreaterThan(lapsedAt);

      const paused = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "paused", q: "   " }),
        }),
      );
      expect(paused).toContain("No paused Players.");
      expect(paused).not.toContain("No Players match that search.");
      expect(paused).toContain("Add Player");
      expect(paused).toMatch(/aria-current="page"[^>]*>Paused</);
      expect(paused).toMatch(/btn-active[^>]*>Paused</);
      expect(paused).toContain('name="status"');
      expect(paused).toContain('value="paused"');
      expect(paused).toMatch(/href="\/app\/players"[^>]*>All</);

      const lapsed = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "lapsed" }),
        }),
      );
      expect(lapsed).toContain("No lapsed Players.");
      expect(lapsed).toContain("Add Player");
      expect(lapsed).toMatch(/aria-current="page"[^>]*>Lapsed</);
      expect(lapsed).toMatch(/btn-active[^>]*>Lapsed</);

      const startsLater = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "starts-later" }),
        }),
      );
      expect(startsLater).toContain("No Players start later.");
      expect(startsLater).toContain("Add Player");
      expect(startsLater).toMatch(/aria-current="page"[^>]*>Starts later</);
      expect(startsLater).toMatch(/btn-active[^>]*>Starts later</);
      expect(startsLater).toContain('name="status"');
      expect(startsLater).toContain('value="starts-later"');

      const missedStartsLater = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({
            status: "starts-later",
            q: "rahul",
          }),
        }),
      );
      expect(missedStartsLater).toContain("No Players match that search.");
      expect(missedStartsLater).not.toContain("No Players start later.");
      expect(missedStartsLater).toMatch(
        /aria-current="page"[^>]*>Starts later</,
      );

      const other = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "active", q: "rahul" }),
        }),
      );
      expect(other).toContain("No Players match that search.");
      expect(other).toMatch(/aria-current="page"[^>]*>All</);
      expect(other).toMatch(/btn-active[^>]*>All</);
      expect(other).toMatch(/href="\/app\/players\?q=rahul"[^>]*>All</);
      expect(other).toContain(
        'href="/app/players?q=rahul&amp;status=paused"',
      );
      expect(other).toContain(
        'href="/app/players?q=rahul&amp;status=lapsed"',
      );
      expect(other).toContain(
        'href="/app/players?q=rahul&amp;status=starts-later"',
      );
      expect(other).not.toContain('name="status"');
    });

    it("narrows to paused Players, or to Players with no Active or paused Enrollment", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await ownerAcademy(cookie);
      const [evening] = await listBatches(academy.id);
      const db = getDb();
      const [morning] = await db
        .insert(batches)
        .values({ academyId: academy.id, name: "Morning nets" })
        .returning({ id: batches.id });
      const today = calendarDateInIst();
      const [active, both, pausedOnly, lapsedOnly, unenrolled, tieA, tieB] =
        await db
          .insert(players)
          .values([
            {
              academyId: academy.id,
              fullName: "Active Rao",
              fullNameNormalized: "active rao",
              phone: "+919876543210",
              dateOfBirth: "2012-04-01",
            },
            {
              academyId: academy.id,
              fullName: "Both Rao",
              fullNameNormalized: "both rao",
              phone: "+919876543211",
              dateOfBirth: "2012-04-02",
            },
            {
              academyId: academy.id,
              fullName: "Paused Rao",
              fullNameNormalized: "paused rao",
              phone: "+919876543212",
              dateOfBirth: "2012-04-03",
            },
            {
              academyId: academy.id,
              fullName: "Lapsed Rao",
              fullNameNormalized: "lapsed rao",
              phone: "+919876543213",
              dateOfBirth: "2012-04-04",
            },
            {
              academyId: academy.id,
              fullName: "Unenrolled Rao",
              fullNameNormalized: "unenrolled rao",
              phone: "+919876543214",
              dateOfBirth: "2012-04-05",
            },
            {
              academyId: academy.id,
              fullName: "Tie Rao",
              fullNameNormalized: "tie rao",
              phone: "+919800000001",
              dateOfBirth: "2012-04-06",
            },
            {
              academyId: academy.id,
              fullName: "Tie Rao",
              fullNameNormalized: "tie rao",
              phone: "+919800000002",
              dateOfBirth: "2012-04-07",
            },
          ])
          .returning({ id: players.id, phone: players.phone });
      const inserted = await db
        .insert(enrollments)
        .values([
          {
            academyId: academy.id,
            playerId: active.id,
            batchId: evening.id,
            daysPerWeek: 3,
            termDays: 45,
            feePaisePaid: 150000,
            validFrom: today,
            validUntil: addCalendarDays(today, 44),
          },
          {
            academyId: academy.id,
            playerId: active.id,
            batchId: morning.id,
            daysPerWeek: 2,
            termDays: 10,
            feePaisePaid: 100000,
            validFrom: addCalendarDays(today, -40),
            validUntil: addCalendarDays(today, -20),
          },
          {
            academyId: academy.id,
            playerId: both.id,
            batchId: evening.id,
            daysPerWeek: 3,
            termDays: 20,
            feePaisePaid: 150000,
            validFrom: addCalendarDays(today, -20),
            validUntil: addCalendarDays(today, -1),
          },
          {
            academyId: academy.id,
            playerId: both.id,
            batchId: morning.id,
            daysPerWeek: 3,
            termDays: 36,
            feePaisePaid: 150000,
            validFrom: addCalendarDays(today, -5),
            validUntil: addCalendarDays(today, 30),
          },
          {
            academyId: academy.id,
            playerId: pausedOnly.id,
            batchId: evening.id,
            daysPerWeek: 3,
            termDays: 31,
            feePaisePaid: 150000,
            validFrom: addCalendarDays(today, -10),
            validUntil: addCalendarDays(today, 20),
          },
          {
            academyId: academy.id,
            playerId: lapsedOnly.id,
            batchId: morning.id,
            daysPerWeek: 2,
            termDays: 10,
            feePaisePaid: 100000,
            validFrom: addCalendarDays(today, -12),
            validUntil: addCalendarDays(today, -3),
          },
          {
            academyId: academy.id,
            playerId: lapsedOnly.id,
            batchId: evening.id,
            daysPerWeek: 2,
            termDays: 21,
            feePaisePaid: 100000,
            validFrom: addCalendarDays(today, -50),
            validUntil: addCalendarDays(today, -30),
          },
          {
            academyId: academy.id,
            playerId: tieA.id,
            batchId: evening.id,
            daysPerWeek: 3,
            termDays: 11,
            feePaisePaid: 150000,
            validFrom: today,
            validUntil: addCalendarDays(today, 10),
          },
          {
            academyId: academy.id,
            playerId: tieB.id,
            batchId: evening.id,
            daysPerWeek: 3,
            termDays: 11,
            feePaisePaid: 150000,
            validFrom: today,
            validUntil: addCalendarDays(today, 10),
          },
        ])
        .returning({ id: enrollments.id, playerId: enrollments.playerId });
      const enrollmentId = (playerId: string) =>
        inserted.find((row) => row.playerId === playerId)!.id;
      await db.insert(enrollmentPauses).values([
        {
          academyId: academy.id,
          enrollmentId: enrollmentId(both.id),
          pausedOn: addCalendarDays(today, -2),
        },
        {
          academyId: academy.id,
          enrollmentId: enrollmentId(pausedOnly.id),
          pausedOn: today,
        },
        {
          academyId: academy.id,
          enrollmentId: enrollmentId(tieA.id),
          pausedOn: today,
        },
        {
          academyId: academy.id,
          enrollmentId: enrollmentId(tieB.id),
          pausedOn: today,
        },
      ]);
      sessionCookie.value = cookie;

      const { default: PlayersPage } = await import("./page");
      const pausedMarkup = renderToStaticMarkup(
        EnrollmentStatus({ status: "paused" }),
      );
      const activeMarkup = renderToStaticMarkup(
        EnrollmentStatus({ status: "active" }),
      );
      const lapsedMarkup = renderToStaticMarkup(
        EnrollmentStatus({ status: "lapsed" }),
      );
      const [earlierTie, laterTie] = [tieA, tieB].sort((left, right) =>
        left.id < right.id ? -1 : 1,
      );

      const pausedHtml = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "paused" }),
        }),
      );
      expect(pausedHtml).toContain("Both Rao");
      expect(pausedHtml).toContain("Paused Rao");
      expect(pausedHtml).toContain(earlierTie.phone);
      expect(pausedHtml).toContain(laterTie.phone);
      expect(pausedHtml).not.toContain("Active Rao");
      expect(pausedHtml).not.toContain("Lapsed Rao");
      expect(pausedHtml).not.toContain("Unenrolled Rao");
      expect(pausedHtml).toContain("Add Player");
      const bothCard = pausedHtml.slice(
        pausedHtml.indexOf("Both Rao"),
        pausedHtml.indexOf("Paused Rao"),
      );
      expect(bothCard.indexOf("Morning nets")).toBeGreaterThan(-1);
      expect(bothCard.indexOf("U-14 evening")).toBeGreaterThan(
        bothCard.indexOf("Morning nets"),
      );
      expect(bothCard).toContain(activeMarkup);
      expect(bothCard).toContain(pausedMarkup);
      expect(pausedHtml.indexOf(earlierTie.phone)).toBeLessThan(
        pausedHtml.indexOf(laterTie.phone),
      );
      expect(pausedHtml.indexOf("Paused Rao")).toBeLessThan(
        pausedHtml.indexOf(earlierTie.phone),
      );

      const lapsedHtml = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "lapsed" }),
        }),
      );
      expect(lapsedHtml).toContain("Lapsed Rao");
      expect(lapsedHtml).toContain("Unenrolled Rao");
      expect(lapsedHtml).toContain(unenrolled.phone);
      expect(lapsedHtml).not.toContain("Active Rao");
      expect(lapsedHtml).not.toContain("Both Rao");
      expect(lapsedHtml).not.toContain("Paused Rao");
      expect(lapsedHtml).not.toContain("Tie Rao");
      expect(lapsedHtml).not.toContain("U-14 evening");
      const lapsedCard = lapsedHtml.slice(
        lapsedHtml.indexOf("Lapsed Rao"),
        lapsedHtml.indexOf("Unenrolled Rao"),
      );
      expect(lapsedCard).toContain("Morning nets");
      expect(lapsedCard).toContain(lapsedMarkup);
      expect(lapsedCard.match(/Morning nets/g)).toHaveLength(1);

      const searched = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "paused", q: "Both" }),
        }),
      );
      expect(searched).toContain("Both Rao");
      expect(searched).not.toContain("Paused Rao");

      const missed = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "lapsed", q: "zzzz" }),
        }),
      );
      expect(missed).toContain("No Players match that search.");

      const spaces = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "paused", q: "   " }),
        }),
      );
      expect(spaces).toContain("Both Rao");
      expect(spaces).toContain("Paused Rao");
      expect(spaces).not.toContain("No Players match that search.");

      const allHtml = renderToStaticMarkup(
        await PlayersPage({ searchParams: Promise.resolve({}) }),
      );
      expect(allHtml).toContain("Active Rao");
      expect(allHtml).toContain("Both Rao");
      expect(allHtml).toContain("Lapsed Rao");
      expect(allHtml).toContain("Unenrolled Rao");
    });

    it("pages the paused cut and keeps the search and the choice", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await ownerAcademy(cookie);
      const [batch] = await listBatches(academy.id);
      const today = calendarDateInIst();
      const db = getDb();
      const pausedPlayers = Array.from({ length: 21 }, (_, index) => {
        const name = `Player ${String(index + 1).padStart(2, "0")}`;
        return {
          academyId: academy.id,
          fullName: name,
          fullNameNormalized: name.toLowerCase(),
          phone: `+919800000${String(index).padStart(3, "0")}`,
          dateOfBirth: "2012-04-01",
        };
      });
      const inserted = await db
        .insert(players)
        .values([
          ...pausedPlayers,
          {
            academyId: academy.id,
            fullName: "Aaa Active",
            fullNameNormalized: "aaa active",
            phone: "+919811111111",
            dateOfBirth: "2012-04-02",
          },
        ])
        .returning({ id: players.id, fullName: players.fullName });
      await db.insert(enrollments).values(
        inserted.map((player) => ({
          academyId: academy.id,
          playerId: player.id,
          batchId: batch.id,
          daysPerWeek: 3,
          termDays: 45,
          feePaisePaid: 150000,
          validFrom: today,
          validUntil: addCalendarDays(today, 44),
        })),
      );
      const enrollmentRows = await db
        .select({ id: enrollments.id, playerId: enrollments.playerId })
        .from(enrollments)
        .where(eq(enrollments.academyId, academy.id));
      const active = inserted.find((player) => player.fullName === "Aaa Active")!;
      await db.insert(enrollmentPauses).values(
        enrollmentRows
          .filter((row) => row.playerId !== active.id)
          .map((row) => ({
            academyId: academy.id,
            enrollmentId: row.id,
            pausedOn: today,
          })),
      );
      sessionCookie.value = cookie;
      const { default: PlayersPage } = await import("./page");

      const first = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "paused" }),
        }),
      );
      expect(first).toContain("Player 01");
      expect(first).toContain("Player 20");
      expect(first).not.toContain("Player 21");
      expect(first).not.toContain("Aaa Active");
      expect(first).toContain("1–20 of 21");
      expect(first).not.toContain("Previous");
      expect(first).toContain('href="/app/players?status=paused&amp;page=2"');
      expect(first).toContain("Next");
      expect(first).toContain("Add Player");

      const second = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({
            status: "paused",
            q: "player",
            page: "2",
          }),
        }),
      );
      expect(second).toContain("Player 21");
      expect(second).not.toContain("Player 01");
      expect(second).not.toContain("Aaa Active");
      expect(second).toContain("21–21 of 21");
      expect(second).toContain("Previous");
      expect(second).not.toContain("Next");
      expect(second).not.toContain("page=");
      expect(second).toContain('href="/app/players?q=player&amp;status=paused"');
      expect(second).toContain('href="/app/players?q=player"');
      expect(second).toContain(
        'href="/app/players?q=player&amp;status=lapsed"',
      );
      expect(second).not.toContain('name="page"');

      const pastEnd = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "paused", page: "9" }),
        }),
      );
      expect(pastEnd).toContain("Player 21");
      expect(pastEnd).toContain("21–21 of 21");
      expect(pastEnd).not.toContain("Aaa Active");

      const notAPage = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "paused", page: "two" }),
        }),
      );
      expect(notAPage).toContain("Player 01");
      expect(notAPage).not.toContain("Player 21");

      const spaces = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "paused", q: "   " }),
        }),
      );
      expect(spaces).toContain("Player 01");
      expect(spaces).toContain("1–20 of 21");
      expect(spaces).not.toContain("No Players match that search.");
    });

    it("lists a Player with an Active Enrollment, phone link, and no fee or Guardian", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await ownerAcademy(cookie);
      const [batch] = await listBatches(academy.id);
      const today = calendarDateInIst();
      const db = getDb();
      const [player] = await db
        .insert(players)
        .values({
          academyId: academy.id,
          fullName: "Rahul Sharma",
          fullNameNormalized: "rahul sharma",
          phone: "+919876543210",
          dateOfBirth: "2012-04-01",
          guardianFullName: "Meera Sharma",
          guardianPhone: "+919111111111",
        })
        .returning({ id: players.id });
      await db.insert(enrollments).values({
        academyId: academy.id,
        playerId: player.id,
        batchId: batch.id,
        daysPerWeek: 3,
        termDays: 45,
        feePaisePaid: 150000,
        validFrom: today,
        validUntil: addCalendarDays(today, 44),
      });
      sessionCookie.value = cookie;

      const { default: PlayersPage } = await import("./page");
      const html = renderToStaticMarkup(
        await PlayersPage({ searchParams: Promise.resolve({}) }),
      );

      expect(html).toContain("Rahul Sharma");
      expect(html).toContain('href="tel:+919876543210"');
      expect(html).toContain("+919876543210");
      expect(html).toContain("U-14 evening");
      expect(html).toContain("Active");
      expect(html).toContain(`href="/app/players/${player.id}"`);
      expect(html).not.toContain("Meera Sharma");
      expect(html).not.toContain("2012-04-01");
      expect(html).not.toContain("₹1,500");
      expect(html).not.toContain("No Players yet.");
    });

    it("searches by name or phone and ignores the Guardian name", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await ownerAcademy(cookie);
      const db = getDb();
      await db.insert(players).values([
        {
          academyId: academy.id,
          fullName: "Rahul 9876",
          fullNameNormalized: "rahul 9876",
          phone: "+919876543210",
          dateOfBirth: "2012-04-01",
          guardianFullName: "Meera Sharma",
          guardianPhone: "+919111111111",
        },
        {
          academyId: academy.id,
          fullName: "Anil Meera",
          fullNameNormalized: "anil meera",
          phone: "+919000000000",
          dateOfBirth: "2010-01-01",
        },
      ]);
      sessionCookie.value = cookie;
      const { default: PlayersPage } = await import("./page");

      async function listed(q: string) {
        return renderToStaticMarkup(
          await PlayersPage({ searchParams: Promise.resolve({ q }) }),
        );
      }

      const byName = await listed("rahul 9876");
      expect(byName).toContain("Rahul 9876");
      expect(byName).not.toContain("Anil Meera");

      const byPhone = await listed("9876543210");
      expect(byPhone).toContain("Rahul 9876");
      expect(byPhone).not.toContain("Anil Meera");

      const bySuffix = await listed("543210");
      expect(bySuffix).toContain("Rahul 9876");
      expect(bySuffix).not.toContain("Anil Meera");

      const byGuardian = await listed("Meera Sharma");
      expect(byGuardian).toContain("No Players match that search.");
      expect(byGuardian).not.toContain("Rahul 9876");

      const everyone = await listed("   ");
      expect(everyone).toContain("Rahul 9876");
      expect(everyone).toContain("Anil Meera");
    });

    it("shows Active and paused lines, or only the newest lapsed line", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await ownerAcademy(cookie);
      const [evening] = await listBatches(academy.id);
      const db = getDb();
      const [morning] = await db
        .insert(batches)
        .values({ academyId: academy.id, name: "Morning nets" })
        .returning({ id: batches.id });
      const today = calendarDateInIst();
      const [player] = await db
        .insert(players)
        .values({
          academyId: academy.id,
          fullName: "Rahul Sharma",
          fullNameNormalized: "rahul sharma",
          phone: "+919876543210",
          dateOfBirth: "2012-04-01",
        })
        .returning({ id: players.id });
      const [older, newerPaused, lapsed] = await db
        .insert(enrollments)
        .values([
          {
            academyId: academy.id,
            playerId: player.id,
            batchId: evening.id,
            daysPerWeek: 3,
            termDays: 45,
            feePaisePaid: 150000,
            validFrom: addCalendarDays(today, -20),
            validUntil: addCalendarDays(today, 24),
          },
          {
            academyId: academy.id,
            playerId: player.id,
            batchId: morning.id,
            daysPerWeek: 3,
            termDays: 45,
            feePaisePaid: 150000,
            validFrom: addCalendarDays(today, -5),
            validUntil: addCalendarDays(today, -1),
          },
          {
            academyId: academy.id,
            playerId: player.id,
            batchId: evening.id,
            daysPerWeek: 2,
            termDays: 10,
            feePaisePaid: 100000,
            validFrom: addCalendarDays(today, -40),
            validUntil: addCalendarDays(today, -30),
          },
        ])
        .returning({ id: enrollments.id });
      await db.insert(enrollmentPauses).values({
        academyId: academy.id,
        enrollmentId: newerPaused.id,
        pausedOn: addCalendarDays(today, -2),
        plannedLastPausedOn: addCalendarDays(today, 4),
      });
      sessionCookie.value = cookie;

      const { default: PlayersPage } = await import("./page");
      const html = renderToStaticMarkup(
        await PlayersPage({ searchParams: Promise.resolve({}) }),
      );
      const morningAt = html.indexOf("Morning nets");
      const eveningAt = html.indexOf("U-14 evening");
      const pausedMarkup = renderToStaticMarkup(EnrollmentStatus({status: "paused"}));
      const activeMarkup = renderToStaticMarkup(EnrollmentStatus({status: "active"}));
      expect(morningAt).toBeGreaterThan(-1);
      expect(eveningAt).toBeGreaterThan(morningAt);
      expect(html).toMatch(new RegExp(`Morning nets[\\s\\S]*?${pausedMarkup}`));
      expect(html).toMatch(new RegExp(`U-14 evening[\\s\\S]*?${activeMarkup}`));
      expect(older.id).toBeTruthy();
      expect(lapsed.id).toBeTruthy();
    });

    it("paginates 20 Players per page and keeps the search on later pages", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await ownerAcademy(cookie);
      const db = getDb();
      await db.insert(players).values(
        Array.from({ length: 21 }, (_, index) => {
          const name = `Player ${String(index + 1).padStart(2, "0")}`;
          return {
            academyId: academy.id,
            fullName: name,
            fullNameNormalized: name.toLowerCase(),
            phone: `+919800000${String(index).padStart(3, "0")}`,
            dateOfBirth: "2012-04-01",
          };
        }),
      );
      sessionCookie.value = cookie;
      const { default: PlayersPage } = await import("./page");

      const first = renderToStaticMarkup(
        await PlayersPage({ searchParams: Promise.resolve({}) }),
      );
      expect(first).toContain("Player 01");
      expect(first).toContain("Player 20");
      expect(first).not.toContain("Player 21");
      expect(first).toContain("1–20 of 21");
      expect(first).not.toContain("Previous");
      expect(first).toContain('href="/app/players?page=2"');
      expect(first).toContain("Next");

      const second = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ page: "2", q: "player" }),
        }),
      );
      expect(second).toContain("Player 21");
      expect(second).not.toContain("Player 01");
      expect(second).toContain("21–21 of 21");
      expect(second).toContain('href="/app/players?q=player"');
      expect(second).toContain("Previous");
      expect(second).not.toContain("Next");

      const pastEnd = renderToStaticMarkup(
        await PlayersPage({ searchParams: Promise.resolve({ page: "9" }) }),
      );
      expect(pastEnd).toContain("Player 21");
      expect(pastEnd).toContain("21–21 of 21");

      const notAPage = renderToStaticMarkup(
        await PlayersPage({ searchParams: Promise.resolve({ page: "two" }) }),
      );
      expect(notAPage).toContain("Player 01");
      expect(notAPage).not.toContain("Player 21");
    });

    it("shows the Batch roster of Active and paused Players, and keeps lapsed Players on the directory", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await ownerAcademy(cookie);
      const [batch] = await listBatches(academy.id);
      const today = calendarDateInIst();
      const pausedOn = addCalendarDays(today, -3);
      const db = getDb();
      const [active, paused, lapsed] = await db
        .insert(players)
        .values([
          {
            academyId: academy.id,
            fullName: "Active Rao",
            fullNameNormalized: "active rao",
            phone: "+919876543210",
            dateOfBirth: "2012-04-01",
          },
          {
            academyId: academy.id,
            fullName: "Paused Rao",
            fullNameNormalized: "paused rao",
            phone: "+919876543211",
            dateOfBirth: "2012-04-02",
          },
          {
            academyId: academy.id,
            fullName: "Lapsed Rao",
            fullNameNormalized: "lapsed rao",
            phone: "+919876543212",
            dateOfBirth: "2012-04-03",
          },
        ])
        .returning({ id: players.id });
      const inserted = await db
        .insert(enrollments)
        .values([
          {
            academyId: academy.id,
            playerId: active.id,
            batchId: batch.id,
            daysPerWeek: 3,
            termDays: 45,
            feePaisePaid: 150000,
            validFrom: today,
            validUntil: addCalendarDays(today, 44),
          },
          {
            academyId: academy.id,
            playerId: paused.id,
            batchId: batch.id,
            daysPerWeek: 3,
            termDays: 45,
            feePaisePaid: 150000,
            validFrom: addCalendarDays(today, -10),
            validUntil: addCalendarDays(today, -1),
          },
          {
            academyId: academy.id,
            playerId: lapsed.id,
            batchId: batch.id,
            daysPerWeek: 3,
            termDays: 10,
            feePaisePaid: 150000,
            validFrom: addCalendarDays(today, -30),
            validUntil: addCalendarDays(today, -20),
          },
        ])
        .returning({ id: enrollments.id });
      await db.insert(enrollmentPauses).values({
        academyId: academy.id,
        enrollmentId: inserted[1].id,
        pausedOn,
      });
      sessionCookie.value = cookie;

      const { default: RosterPage } = await import("../batches/[batchId]/page");
      const { default: PlayersPage } = await import("./page");
      const { default: BatchesPage } = await import("../batches/page");
      const roster = renderToStaticMarkup(
        await RosterPage({
          params: Promise.resolve({ batchId: batch.id }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(roster).toContain("U-14 evening");
      expect(roster).toContain("Active Rao");
      expect(roster).toContain("Paused Rao");
      expect(roster).toContain(
        `Paused ${formatCalendarDate(pausedOn)}, open-ended`,
      );
      expect(roster).not.toContain("Lapsed Rao");
      expect(roster).not.toContain("Search");
      expect(roster).toContain(
        `href="/app/players/${paused.id}?fromBatch=${batch.id}"`,
      );

      const directory = renderToStaticMarkup(
        await PlayersPage({ searchParams: Promise.resolve({}) }),
      );
      expect(directory).toContain("Lapsed Rao");
      expect(directory).toContain("Lapsed");

      const batchesHtml = renderToStaticMarkup(await BatchesPage());
      expect(batchesHtml).toContain(`href="/app/batches/${batch.id}"`);
    });

    it("lists every Enrollment on the Player, including a pause and a renewed term", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await ownerAcademy(cookie);
      const [batch] = await listBatches(academy.id);
      const today = calendarDateInIst();
      const plannedLast = addCalendarDays(today, 2);
      const db = getDb();
      const [player] = await db
        .insert(players)
        .values({
          academyId: academy.id,
          fullName: "Mini Rao",
          fullNameNormalized: "mini rao",
          phone: "+919876543210",
          dateOfBirth: "2015-06-15",
          guardianFullName: "Asha Rao",
          guardianPhone: "+919111111111",
          email: "mini@example.com",
        })
        .returning({ id: players.id });
      const [prior] = await db
        .insert(enrollments)
        .values({
          academyId: academy.id,
          playerId: player.id,
          batchId: batch.id,
          daysPerWeek: 3,
          termDays: 10,
          feePaisePaid: 150000,
          validFrom: addCalendarDays(today, -40),
          validUntil: addCalendarDays(today, -30),
        })
        .returning({ id: enrollments.id });
      const validFrom = addCalendarDays(today, -4);
      await db.insert(enrollments).values({
        academyId: academy.id,
        playerId: player.id,
        batchId: batch.id,
        daysPerWeek: 3,
        termDays: 45,
        feePaisePaid: 150000,
        validFrom,
        validUntil: addCalendarDays(today, -1),
        renewedFromEnrollmentId: prior.id,
      });
      const [current] = await db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(eq(enrollments.renewedFromEnrollmentId, prior.id))
        .limit(1);
      await db.insert(enrollmentPauses).values({
        academyId: academy.id,
        enrollmentId: current.id,
        pausedOn: validFrom,
        plannedLastPausedOn: plannedLast,
      });
      sessionCookie.value = cookie;

      const { default: PlayerPage } = await import("./[playerId]/page");
      const html = renderToStaticMarkup(
        await PlayerPage({
          params: Promise.resolve({ playerId: player.id }),
          searchParams: Promise.resolve({}),
        }),
      );
      const currentAt = html.indexOf("This term continues the previous one.");
      const lapsedAt = html.indexOf("Lapsed");
      expect(html).toContain("Mini Rao");
      expect(html).toContain("Add Enrollment");
      expect(html).toContain('href="tel:+919876543210"');
      expect(html).toContain(formatCalendarDate("2015-06-15"));
      expect(html).toContain("Guardian: Asha Rao");
      expect(html).toContain("Email: mini@example.com");
      expect(html).not.toContain("+919111111111");
      expect(html).toContain(`href="/app/batches/${batch.id}"`);
      expect(html).toContain("3 days per week · 45 days · ₹1,500");
      expect(html).toContain(`Valid from ${formatCalendarDate(validFrom)}`);
      expect(html).toContain(
        `Paused ${formatCalendarDate(validFrom)}, through ${formatCalendarDate(plannedLast)}`,
      );
      expect(currentAt).toBeGreaterThan(-1);
      expect(lapsedAt).toBeGreaterThan(currentAt);
      expect(html).toContain(">Resume<");
      expect(html).not.toContain(">Pause<");
      expect(html).not.toContain("Renew");
    });

    it("sends Go Back to the Batch roster when opened from it, else the directory", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await ownerAcademy(cookie);
      const [batch] = await listBatches(academy.id);
      const today = calendarDateInIst();
      const db = getDb();
      const [player] = await db
        .insert(players)
        .values({
          academyId: academy.id,
          fullName: "Backlink Rao",
          fullNameNormalized: "backlink rao",
          phone: "+919876543210",
          dateOfBirth: "2012-04-01",
        })
        .returning({ id: players.id });
      await db.insert(enrollments).values({
        academyId: academy.id,
        playerId: player.id,
        batchId: batch.id,
        daysPerWeek: 3,
        termDays: 45,
        feePaisePaid: 150000,
        validFrom: today,
        validUntil: addCalendarDays(today, 44),
      });
      sessionCookie.value = cookie;

      const { default: PlayerPage } = await import("./[playerId]/page");
      const fromDirectory = renderToStaticMarkup(
        await PlayerPage({
          params: Promise.resolve({ playerId: player.id }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(fromDirectory).toMatch(
        /href="\/app\/players"[^>]*>[\s\S]*?Go Back/,
      );

      const fromRoster = renderToStaticMarkup(
        await PlayerPage({
          params: Promise.resolve({ playerId: player.id }),
          searchParams: Promise.resolve({ fromBatch: batch.id }),
        }),
      );
      expect(fromRoster).toMatch(
        new RegExp(
          `href="/app/batches/${batch.id}"[^>]*>[\\s\\S]*?Go Back`,
        ),
      );
    });

    it("shows a finished dated pause as Active with the extended valid-until", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await ownerAcademy(cookie);
      const [batch] = await listBatches(academy.id);
      const today = calendarDateInIst();
      const pausedOn = addCalendarDays(today, -5);
      const plannedLast = addCalendarDays(today, -1);
      const storedUntil = addCalendarDays(today, -1);
      const db = getDb();
      const [player] = await db
        .insert(players)
        .values({
          academyId: academy.id,
          fullName: "Settled Rao",
          fullNameNormalized: "settled rao",
          phone: "+919876543210",
          dateOfBirth: "2012-04-01",
        })
        .returning({ id: players.id });
      await db.insert(enrollments).values({
        academyId: academy.id,
        playerId: player.id,
        batchId: batch.id,
        daysPerWeek: 3,
        termDays: 10,
        feePaisePaid: 150000,
        validFrom: addCalendarDays(today, -10),
        validUntil: storedUntil,
      });
      const [enrollment] = await db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(eq(enrollments.playerId, player.id))
        .limit(1);
      await db.insert(enrollmentPauses).values({
        academyId: academy.id,
        enrollmentId: enrollment.id,
        pausedOn,
        plannedLastPausedOn: plannedLast,
      });
      sessionCookie.value = cookie;

      const { default: PlayerPage } = await import("./[playerId]/page");
      const html = renderToStaticMarkup(
        await PlayerPage({
          params: Promise.resolve({ playerId: player.id }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(html).toContain("Active");
      expect(html).toContain(
        `Valid until ${formatCalendarDate(addCalendarDays(today, 4))}`,
      );
      expect(html).not.toContain("open-ended");
      expect(html).toContain(">Pause<");
      expect(html).not.toContain(">Resume<");
    });

    it("shows Pause on Active, Resume on paused, and neither on lapsed", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await ownerAcademy(cookie);
      const [batch] = await listBatches(academy.id);
      const today = calendarDateInIst();
      const db = getDb();
      const [player] = await db
        .insert(players)
        .values({
          academyId: academy.id,
          fullName: "Controls Rao",
          fullNameNormalized: "controls rao",
          phone: "+919876543210",
          dateOfBirth: "2012-04-01",
        })
        .returning({ id: players.id });
      const [paused] = await db
        .insert(enrollments)
        .values({
          academyId: academy.id,
          playerId: player.id,
          batchId: batch.id,
          daysPerWeek: 3,
          termDays: 10,
          feePaisePaid: 100000,
          validFrom: addCalendarDays(today, -20),
          validUntil: addCalendarDays(today, -11),
        })
        .returning({ id: enrollments.id });
      await db.insert(enrollments).values({
        academyId: academy.id,
        playerId: player.id,
        batchId: batch.id,
        daysPerWeek: 3,
        termDays: 10,
        feePaisePaid: 100000,
        validFrom: addCalendarDays(today, -40),
        validUntil: addCalendarDays(today, -31),
      });
      await db.insert(enrollments).values({
        academyId: academy.id,
        playerId: player.id,
        batchId: batch.id,
        daysPerWeek: 3,
        termDays: 45,
        feePaisePaid: 150000,
        validFrom: today,
        validUntil: addCalendarDays(today, 44),
      });
      await db.insert(enrollmentPauses).values({
        academyId: academy.id,
        enrollmentId: paused.id,
        pausedOn: addCalendarDays(today, -12),
      });
      sessionCookie.value = cookie;

      const { default: PlayerPage } = await import("./[playerId]/page");
      const html = renderToStaticMarkup(
        await PlayerPage({
          params: Promise.resolve({ playerId: player.id }),
          searchParams: Promise.resolve({}),
        }),
      );

      const pauseCount = html.split(">Pause<").length - 1;
      const resumeCount = html.split(">Resume<").length - 1;
      expect(pauseCount).toBe(1);
      expect(resumeCount).toBe(1);
      expect(html).toContain("Lapsed");
      expect(html).toContain("Active");
      expect(html).toContain("Paused");
    });

    it("hides another Academy’s Players and unknown ids", async () => {
      const cookie = await signInOwner(ownerEmail);
      const otherCookie = await signInOwner(otherEmail);
      await onboardOwner(cookie, slug);
      await onboardOwner(otherCookie, otherSlug);
      const academy = await ownerAcademy(cookie);
      const other = await ownerAcademy(otherCookie);
      const [otherBatch] = await listBatches(other.id);
      const db = getDb();
      const [hidden] = await db
        .insert(players)
        .values({
          academyId: other.id,
          fullName: "Hidden Rao",
          fullNameNormalized: "hidden rao",
          phone: "+919876543210",
          dateOfBirth: "2012-04-01",
        })
        .returning({ id: players.id });
      sessionCookie.value = cookie;

      const { default: PlayersPage } = await import("./page");
      const { default: PlayerPage } = await import("./[playerId]/page");
      const { default: RosterPage } = await import("../batches/[batchId]/page");
      const directory = renderToStaticMarkup(
        await PlayersPage({ searchParams: Promise.resolve({}) }),
      );
      expect(directory).not.toContain("Hidden Rao");
      expect(directory).toContain("No Players yet.");

      await expect(
        PlayerPage({
          params: Promise.resolve({ playerId: hidden.id }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow();
      await expect(
        RosterPage({
          params: Promise.resolve({ batchId: otherBatch.id }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow();
      await expect(
        PlayerPage({
          params: Promise.resolve({
            playerId: "00000000-0000-4000-8000-000000000000",
          }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow();
      expect(academy.id).not.toBe(other.id);
    });

    it("shows Starts later on the roster and Player page, and keeps that Player out of the paused and lapsed cuts", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await ownerAcademy(cookie);
      const [evening] = await listBatches(academy.id);
      const today = calendarDateInIst();
      const startsOn = addCalendarDays(today, 10);
      const db = getDb();
      const [morning] = await db
        .insert(batches)
        .values({ academyId: academy.id, name: "U-16 morning" })
        .returning({ id: batches.id });
      const [later, mixed] = await db
        .insert(players)
        .values([
          {
            academyId: academy.id,
            fullName: "Later Rao",
            fullNameNormalized: "later rao",
            phone: "+919876543210",
            dateOfBirth: "2012-04-01",
          },
          {
            academyId: academy.id,
            fullName: "Mixed Rao",
            fullNameNormalized: "mixed rao",
            phone: "+919876543211",
            dateOfBirth: "2012-04-02",
          },
        ])
        .returning({ id: players.id });
      const inserted = await db
        .insert(enrollments)
        .values([
          {
            academyId: academy.id,
            playerId: later.id,
            batchId: evening.id,
            daysPerWeek: 3,
            termDays: 30,
            feePaisePaid: 150000,
            validFrom: today,
            validUntil: lastCoveredDay(today, 30),
          },
          {
            academyId: academy.id,
            playerId: mixed.id,
            batchId: evening.id,
            daysPerWeek: 3,
            termDays: 30,
            feePaisePaid: 150000,
            validFrom: today,
            validUntil: lastCoveredDay(today, 30),
          },
          {
            academyId: academy.id,
            playerId: mixed.id,
            batchId: morning.id,
            daysPerWeek: 3,
            termDays: 30,
            feePaisePaid: 150000,
            validFrom: addCalendarDays(today, -5),
            validUntil: lastCoveredDay(addCalendarDays(today, -5), 30),
          },
        ])
        .returning({ id: enrollments.id });
      await db.insert(enrollmentPauses).values([
        {
          academyId: academy.id,
          enrollmentId: inserted[0].id,
          pausedOn: today,
          plannedLastPausedOn: addCalendarDays(startsOn, -1),
          isDeferred: true,
        },
        {
          academyId: academy.id,
          enrollmentId: inserted[1].id,
          pausedOn: today,
          plannedLastPausedOn: addCalendarDays(startsOn, -1),
          isDeferred: true,
        },
        {
          academyId: academy.id,
          enrollmentId: inserted[2].id,
          pausedOn: addCalendarDays(today, -2),
          isDeferred: false,
        },
      ]);
      sessionCookie.value = cookie;

      const { default: RosterPage } = await import("../batches/[batchId]/page");
      const { default: PlayersPage } = await import("./page");
      const { default: PlayerPage } = await import("./[playerId]/page");
      const startsLater = renderToStaticMarkup(
        EnrollmentStatus({ status: "paused", startsLater: true }),
      );
      const pausedMarkup = renderToStaticMarkup(
        EnrollmentStatus({ status: "paused" }),
      );

      const roster = renderToStaticMarkup(
        await RosterPage({
          params: Promise.resolve({ batchId: evening.id }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(roster).toContain("Later Rao");
      expect(roster).toContain(startsLater);
      expect(roster).toContain(`First day ${formatCalendarDate(startsOn)}`);
      expect(roster).toContain(`Valid from ${formatCalendarDate(today)}`);
      expect(roster).toContain(
        `Valid until ${formatCalendarDate(lastCoveredDay(startsOn, 30))}`,
      );
      expect(roster).not.toContain(">Pause<");

      const playerHtml = renderToStaticMarkup(
        await PlayerPage({
          params: Promise.resolve({ playerId: later.id }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(playerHtml).toContain(startsLater);
      expect(playerHtml).toContain(`First day ${formatCalendarDate(startsOn)}`);
      expect(playerHtml).toContain(`Valid from ${formatCalendarDate(today)}`);
      expect(playerHtml).toContain(
        `Valid until ${formatCalendarDate(lastCoveredDay(startsOn, 30))}`,
      );
      expect(playerHtml).toContain(">Start Now<");
      expect(playerHtml).not.toContain(">Resume<");
      expect(playerHtml).not.toContain(">Pause<");

      const mixedHtml = renderToStaticMarkup(
        await PlayerPage({
          params: Promise.resolve({ playerId: mixed.id }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(mixedHtml.split(">Start Now<").length - 1).toBe(1);
      expect(mixedHtml.split(">Resume<").length - 1).toBe(1);

      const all = renderToStaticMarkup(
        await PlayersPage({ searchParams: Promise.resolve({}) }),
      );
      expect(all).toContain("Later Rao");
      expect(all).toContain(startsLater);

      const pausedCut = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "paused" }),
        }),
      );
      expect(pausedCut).toContain("Mixed Rao");
      expect(pausedCut).not.toContain("Later Rao");
      const mixedCard = pausedCut.slice(pausedCut.indexOf("Mixed Rao"));
      expect(mixedCard).toContain(startsLater);
      expect(mixedCard).toContain(pausedMarkup);

      const lapsedCut = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "lapsed" }),
        }),
      );
      expect(lapsedCut).not.toContain("Later Rao");
      expect(lapsedCut).not.toContain("Mixed Rao");
    });

    it("shows an Enrollment as Active once a deferred start has ended", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await ownerAcademy(cookie);
      const [batch] = await listBatches(academy.id);
      const today = calendarDateInIst();
      const pausedOn = addCalendarDays(today, -10);
      const db = getDb();
      const [player] = await db
        .insert(players)
        .values({
          academyId: academy.id,
          fullName: "Ended Rao",
          fullNameNormalized: "ended rao",
          phone: "+919876543210",
          dateOfBirth: "2012-04-01",
        })
        .returning({ id: players.id });
      await db.insert(enrollments).values({
        academyId: academy.id,
        playerId: player.id,
        batchId: batch.id,
        daysPerWeek: 3,
        termDays: 30,
        feePaisePaid: 150000,
        validFrom: pausedOn,
        validUntil: lastCoveredDay(pausedOn, 30),
      });
      const [enrollment] = await db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(eq(enrollments.playerId, player.id));
      await db.insert(enrollmentPauses).values({
        academyId: academy.id,
        enrollmentId: enrollment.id,
        pausedOn,
        plannedLastPausedOn: addCalendarDays(today, -1),
        isDeferred: true,
      });
      sessionCookie.value = cookie;

      const { default: PlayerPage } = await import("./[playerId]/page");
      const html = renderToStaticMarkup(
        await PlayerPage({
          params: Promise.resolve({ playerId: player.id }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(html).toContain("Active");
      expect(html).not.toContain("Starts later");
      expect(html).toContain(
        `Valid until ${formatCalendarDate(lastCoveredDay(today, 30))}`,
      );
    });

    it("lists every Player with an open deferred start, including one who is also Active or paused", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await ownerAcademy(cookie);
      const [evening] = await listBatches(academy.id);
      const today = calendarDateInIst();
      const startsOn = addCalendarDays(today, 10);
      const db = getDb();
      const [morning, finished] = await db
        .insert(batches)
        .values([
          { academyId: academy.id, name: "Morning nets" },
          { academyId: academy.id, name: "Finished nets" },
        ])
        .returning({ id: batches.id });
      const [later, activeAlso, pausedAlso, resumed, arrived, pausedOnly] =
        await db
          .insert(players)
          .values([
            {
              academyId: academy.id,
              fullName: "Later Rao",
              fullNameNormalized: "later rao",
              phone: "+919876543210",
              dateOfBirth: "2012-04-01",
            },
            {
              academyId: academy.id,
              fullName: "Active Also",
              fullNameNormalized: "active also",
              phone: "+919876543211",
              dateOfBirth: "2012-04-02",
            },
            {
              academyId: academy.id,
              fullName: "Paused Also",
              fullNameNormalized: "paused also",
              phone: "+919876543212",
              dateOfBirth: "2012-04-03",
            },
            {
              academyId: academy.id,
              fullName: "Resumed Rao",
              fullNameNormalized: "resumed rao",
              phone: "+919876543213",
              dateOfBirth: "2012-04-04",
            },
            {
              academyId: academy.id,
              fullName: "Arrived Rao",
              fullNameNormalized: "arrived rao",
              phone: "+919876543214",
              dateOfBirth: "2012-04-05",
            },
            {
              academyId: academy.id,
              fullName: "Paused Rao",
              fullNameNormalized: "paused rao",
              phone: "+919876543215",
              dateOfBirth: "2012-04-06",
            },
          ])
          .returning({ id: players.id });
      const term = (playerId: string, batchId: string, validFrom: string) => ({
        academyId: academy.id,
        playerId,
        batchId,
        daysPerWeek: 3,
        termDays: 30,
        feePaisePaid: 150000,
        validFrom,
        validUntil: lastCoveredDay(validFrom, 30),
      });
      const inserted = await db
        .insert(enrollments)
        .values([
          term(later.id, evening.id, today),
          term(later.id, finished.id, addCalendarDays(today, -40)),
          term(activeAlso.id, evening.id, today),
          term(activeAlso.id, morning.id, addCalendarDays(today, -5)),
          term(pausedAlso.id, evening.id, today),
          term(pausedAlso.id, morning.id, addCalendarDays(today, -5)),
          term(resumed.id, evening.id, addCalendarDays(today, -5)),
          term(arrived.id, evening.id, addCalendarDays(today, -10)),
          term(pausedOnly.id, evening.id, today),
        ])
        .returning({
          id: enrollments.id,
          playerId: enrollments.playerId,
          batchId: enrollments.batchId,
        });
      const enrollmentId = (playerId: string, batchId: string) =>
        inserted.find(
          (row) => row.playerId === playerId && row.batchId === batchId,
        )!.id;
      const openDeferredStart = (playerId: string) => ({
        academyId: academy.id,
        enrollmentId: enrollmentId(playerId, evening.id),
        pausedOn: today,
        plannedLastPausedOn: addCalendarDays(startsOn, -1),
        isDeferred: true,
      });
      await db.insert(enrollmentPauses).values([
        openDeferredStart(later.id),
        openDeferredStart(activeAlso.id),
        openDeferredStart(pausedAlso.id),
        {
          academyId: academy.id,
          enrollmentId: enrollmentId(pausedAlso.id, morning.id),
          pausedOn: addCalendarDays(today, -2),
          isDeferred: false,
        },
        {
          academyId: academy.id,
          enrollmentId: enrollmentId(resumed.id, evening.id),
          pausedOn: addCalendarDays(today, -5),
          plannedLastPausedOn: addCalendarDays(today, 4),
          resumedOn: today,
          isDeferred: true,
        },
        {
          academyId: academy.id,
          enrollmentId: enrollmentId(arrived.id, evening.id),
          pausedOn: addCalendarDays(today, -10),
          plannedLastPausedOn: addCalendarDays(today, -1),
          isDeferred: true,
        },
        {
          academyId: academy.id,
          enrollmentId: enrollmentId(pausedOnly.id, evening.id),
          pausedOn: today,
          isDeferred: false,
        },
      ]);
      sessionCookie.value = cookie;

      const { default: PlayersPage } = await import("./page");
      const startsLaterBadge = renderToStaticMarkup(
        EnrollmentStatus({ status: "paused", startsLater: true }),
      );
      const activeMarkup = renderToStaticMarkup(
        EnrollmentStatus({ status: "active" }),
      );
      const pausedMarkup = renderToStaticMarkup(
        EnrollmentStatus({ status: "paused" }),
      );

      const startsLater = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "starts-later" }),
        }),
      );
      expect(startsLater).toContain("Later Rao");
      expect(startsLater).toContain("Active Also");
      expect(startsLater).toContain("Paused Also");
      expect(startsLater).not.toContain("Resumed Rao");
      expect(startsLater).not.toContain("Arrived Rao");
      expect(startsLater).not.toContain("Paused Rao");
      const laterCard = startsLater.slice(
        startsLater.indexOf("Later Rao"),
        startsLater.indexOf("Paused Also"),
      );
      expect(laterCard).toContain("U-14 evening");
      expect(laterCard).toContain(startsLaterBadge);
      expect(laterCard).not.toContain("Finished nets");
      const activeCard = startsLater.slice(
        startsLater.indexOf("Active Also"),
        startsLater.indexOf("Later Rao"),
      );
      expect(activeCard.indexOf("U-14 evening")).toBeGreaterThan(-1);
      expect(activeCard.indexOf("Morning nets")).toBeGreaterThan(
        activeCard.indexOf("U-14 evening"),
      );
      expect(activeCard).toContain(startsLaterBadge);
      expect(activeCard).toContain(activeMarkup);
      const pausedCard = startsLater.slice(startsLater.indexOf("Paused Also"));
      expect(pausedCard).toContain("U-14 evening");
      expect(pausedCard).toContain("Morning nets");
      expect(pausedCard).toContain(startsLaterBadge);
      expect(pausedCard).toContain(pausedMarkup);

      const pausedCut = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "paused" }),
        }),
      );
      expect(pausedCut).toContain("Paused Also");
      expect(pausedCut).toContain("Paused Rao");
      expect(pausedCut).not.toContain("Later Rao");
      expect(pausedCut).not.toContain("Active Also");
      expect(pausedCut).not.toContain("Resumed Rao");
      expect(pausedCut).not.toContain("Arrived Rao");

      const lapsedCut = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "lapsed" }),
        }),
      );
      expect(lapsedCut).not.toContain("Later Rao");
      expect(lapsedCut).not.toContain("Active Also");
      expect(lapsedCut).not.toContain("Paused Also");

      const searched = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({
            status: "starts-later",
            q: "Active",
          }),
        }),
      );
      expect(searched).toContain("Active Also");
      expect(searched).not.toContain("Later Rao");
      expect(searched).toContain('value="starts-later"');

      const missed = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({
            status: "starts-later",
            q: "zzzz",
          }),
        }),
      );
      expect(missed).toContain("No Players match that search.");
    });

    it("pages the Starts later cut and keeps the search and the choice", async () => {
      const cookie = await signInOwner(ownerEmail);
      await onboardOwner(cookie, slug);
      const academy = await ownerAcademy(cookie);
      const [batch] = await listBatches(academy.id);
      const today = calendarDateInIst();
      const db = getDb();
      const laterPlayers = Array.from({ length: 21 }, (_, index) => {
        const name = `Player ${String(index + 1).padStart(2, "0")}`;
        return {
          academyId: academy.id,
          fullName: name,
          fullNameNormalized: name.toLowerCase(),
          phone: `+919800000${String(index).padStart(3, "0")}`,
          dateOfBirth: "2012-04-01",
        };
      });
      const inserted = await db
        .insert(players)
        .values([
          ...laterPlayers,
          {
            academyId: academy.id,
            fullName: "Aaa Active",
            fullNameNormalized: "aaa active",
            phone: "+919811111111",
            dateOfBirth: "2012-04-02",
          },
        ])
        .returning({ id: players.id, fullName: players.fullName });
      const enrollmentRows = await db
        .insert(enrollments)
        .values(
          inserted.map((player) => ({
            academyId: academy.id,
            playerId: player.id,
            batchId: batch.id,
            daysPerWeek: 3,
            termDays: 45,
            feePaisePaid: 150000,
            validFrom: today,
            validUntil: addCalendarDays(today, 44),
          })),
        )
        .returning({ id: enrollments.id, playerId: enrollments.playerId });
      const active = inserted.find((player) => player.fullName === "Aaa Active")!;
      await db.insert(enrollmentPauses).values(
        enrollmentRows
          .filter((row) => row.playerId !== active.id)
          .map((row) => ({
            academyId: academy.id,
            enrollmentId: row.id,
            pausedOn: today,
            plannedLastPausedOn: addCalendarDays(today, 9),
            isDeferred: true,
          })),
      );
      sessionCookie.value = cookie;
      const { default: PlayersPage } = await import("./page");

      const first = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({ status: "starts-later" }),
        }),
      );
      expect(first).toContain("Player 01");
      expect(first).toContain("Player 20");
      expect(first).not.toContain("Player 21");
      expect(first).not.toContain("Aaa Active");
      expect(first).toContain("1–20 of 21");
      expect(first).toContain(
        'href="/app/players?status=starts-later&amp;page=2"',
      );

      const second = renderToStaticMarkup(
        await PlayersPage({
          searchParams: Promise.resolve({
            status: "starts-later",
            q: "player",
            page: "2",
          }),
        }),
      );
      expect(second).toContain("Player 21");
      expect(second).not.toContain("Player 01");
      expect(second).not.toContain("Aaa Active");
      expect(second).toContain("21–21 of 21");
      expect(second).toContain(
        'href="/app/players?q=player&amp;status=starts-later"',
      );
      expect(second).not.toContain("page=");
    });
  },
);

describe("resume confirmation for a deferred start", () => {
  it("counts only the days actually paused, not the projected term", () => {
    const today = "2026-10-06";
    const storedUntil = "2026-11-04";
    const shownUntil = "2026-11-14";
    expect(resumeConfirmCopy(today, today, storedUntil, shownUntil)).toBe(
      `Adds 0 days → valid-until ${formatCalendarDate(storedUntil)}`,
    );
    expect(
      resumeConfirmCopy("2026-10-02", today, "2026-10-31", shownUntil),
    ).toBe(`Adds 4 days → valid-until ${formatCalendarDate("2026-11-04")}`);
  });

  it("leaves a normal pause unchanged when resume adds no days", () => {
    expect(
      resumeConfirmCopy("2026-10-06", "2026-10-06", "2026-11-04", "2026-11-04"),
    ).toBe("Adds 0 days; valid-until unchanged");
  });
});
