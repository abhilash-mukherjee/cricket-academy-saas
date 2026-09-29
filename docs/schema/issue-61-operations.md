# Issue #61 vertical — academy operations

Blueprint for the Owner roster: Registration accept and reject, manual add, the Player directory, Enrollment pause and renew, and Session attendance. Parent spec: [#61](https://github.com/abhilash-mukherjee/cricket-academy-saas/issues/61). Children: [#7](https://github.com/abhilash-mukherjee/cricket-academy-saas/issues/7), [#62](https://github.com/abhilash-mukherjee/cricket-academy-saas/issues/62), [#63](https://github.com/abhilash-mukherjee/cricket-academy-saas/issues/63), [#64](https://github.com/abhilash-mukherjee/cricket-academy-saas/issues/64), [#65](https://github.com/abhilash-mukherjee/cricket-academy-saas/issues/65), [#66](https://github.com/abhilash-mukherjee/cricket-academy-saas/issues/66).

Amends [issue #1 vertical](./issue-1-vertical.md) where this file says so. Trade-offs: [ADR-0034](../adr/0034-guardian-copied-onto-player.md), [ADR-0035](../adr/0035-owner-chooses-enrollment-valid-from.md), [ADR-0036](../adr/0036-dated-pause-ends-on-its-last-day.md), [ADR-0037](../adr/0037-enrollment-pauses-are-rows.md), [ADR-0038](../adr/0038-attendance-save-rejects-a-stale-list.md). Writes that read then decide use a transaction ([ADR-0024](../adr/0024-neon-http-not-session-locks.md)).

After implementation, `db/domain-schema.ts` and migrations are canonical; update this doc when the schema changes intentionally.

Language is `CONTEXT.md`. **Active**, paused, and lapsed are computed. They are not stored columns.

## Conventions

Same as the #1 blueprint: uuid keys, `academy_id` on every Academy-scoped row, `ON DELETE RESTRICT`, phones stored as E.164, Zod for new request bodies ([ADR-0030](../adr/0030-zod-for-validation.md)).

**Today** is the Asia/Kolkata calendar date from `calendarDateInIst` in `lib/player-age.ts`.

**Last covered day** is `lastCoveredDay` in `lib/enrollment-term.ts`: `valid_from` counts as day one, so `valid_until = valid_from + term_days − 1`.

## Repo layout

- `lib/registrations.ts` — submit (already), plus accept and reject
- `lib/players.ts` — find or create by name + phone, directory, Batch roster
- `lib/enrollments.ts` — create, pause, resume, renew, and pause settlement
- `lib/batch-sessions.ts` — read the list for a date, save, discard
- `getDb()` stays `drizzle-orm/neon-http` for reads
- These commands use a second Drizzle client on `drizzle-orm/neon-serverless` (WebSocket pool) so one transaction can read, decide, and write

Every function takes `academyId` from `resolveOwnerContext`. The client never supplies it. A successful write calls `recordOwnerWriteIfImpersonating`.

## Computed Enrollment state

Settle a dated pause in memory before any decision. Persist that settlement only inside a writing transaction, before the command decides.

A dated pause whose planned last day is before today is finished. Its end day is the day after that planned last day. `valid_until` grows by the paused days. A read shows this result and does not write it. A dated pause saved with its last day already in the past persists the extension in that same command.

**Paused days** are the first paused day inclusive through the end day exclusive. The end day is the first day not paused. Same-day resume stores the end day equal to the first paused day and adds none. An early resume sets the end day to today and keeps the planned last day on the row. The count uses the end day.

**Currently paused** (directory, roster, renew, pause): an open pause with no end day yet, whose interval covers today. An open-ended pause covers every date from its first day forward. A dated pause that is still running covers its first day through its planned last day.

**Effective `valid_until`:** the stored date, plus days from any dated pause that is finished and not yet persisted.

**Active:** not currently paused, and effective `valid_until` is today or later.

**Lapsed:** not currently paused, and effective `valid_until` is before today. A paused Enrollment stays paused while its stored `valid_until` is still in the past.

**Paused on a date D** (Session eligibility): a closed pause covers `[first day, end day)`. An open dated pause covers `[first day, day after planned last)`. An open-ended pause covers `[first day, ∞)`.

## Changes to existing tables

### `players`

Add:

| Column | Type | Notes |
| --- | --- | --- |
| `guardian_full_name` | `text` nullable | Copied at create when the Player is under 18 |
| `guardian_phone` | `text` nullable | E.164 |
| `email` | `text` nullable | Optional contact email; not a login; not used for identity. Format-validated in the app when present |

No Guardian table ([ADR-0034](../adr/0034-guardian-copied-onto-player.md)). Identity stays `(academy_id, full_name_normalized, phone)`. Name, phone, date of birth, Guardian, and email are not edited after create (email is only filled when the Player still has none).

`full_name` is the trimmed typed name. `full_name_normalized` is that value lowercased, the same as `registrations.player_full_name_normalized`.

### `enrollments`

`registration_id` becomes nullable. Manual add and renew leave it null. Accept sets it.

| Constraint | |
| --- | --- |
| `UNIQUE (registration_id) WHERE registration_id IS NOT NULL` | One Enrollment per Registration |
| No `UNIQUE (player_id, batch_id)` | History stays. Ranges must not overlap; enforced in the command, not by an exclusion constraint |

`valid_from` is the Owner-chosen start. At create, `valid_until` comes from the term. Pause is the only later change to `valid_until`. Days per week, term days, and fee paid do not change.

## New tables

### `enrollment_pauses`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `academy_id` | `uuid NOT NULL` FK → `academies` | |
| `enrollment_id` | `uuid NOT NULL` FK → `enrollments` | |
| `paused_on` | `date NOT NULL` | First paused day |
| `planned_last_paused_on` | `date` nullable | Owner’s dated end. Null when open-ended. Kept if they resume earlier |
| `resumed_on` | `date` nullable | First day not paused. Null while the pause is open |
| `created_at` / `updated_at` | `timestamptz` | |

**Constraints**

- `CHECK (planned_last_paused_on IS NULL OR planned_last_paused_on >= paused_on)`
- `CHECK (resumed_on IS NULL OR resumed_on >= paused_on)`
- Partial unique: `UNIQUE (enrollment_id) WHERE resumed_on IS NULL` — at most one open pause

### `batch_sessions`

The attendance occurrence. Not Better Auth’s `session` table. The product word stays **Session**.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `academy_id` | `uuid NOT NULL` FK → `academies` | |
| `batch_id` | `uuid NOT NULL` FK → `batches` | |
| `session_date` | `date NOT NULL` | Today or earlier |
| `created_at` | `timestamptz` | |

**Constraint:** `UNIQUE (academy_id, batch_id, session_date)`

The row is inserted on the first save. Opening a date with no row writes nothing.

### `batch_session_attendance`

Postgres enum `batch_session_attendance_mark`: `present` | `absent`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `academy_id` | `uuid NOT NULL` FK → `academies` | |
| `batch_session_id` | `uuid NOT NULL` FK → `batch_sessions` | |
| `player_id` | `uuid NOT NULL` FK → `players` | |
| `enrollment_id` | `uuid NOT NULL` FK → `enrollments` | The Enrollment that put the Player on the list |
| `mark` | `batch_session_attendance_mark NOT NULL` | |
| `created_at` / `updated_at` | `timestamptz` | |

**Constraint:** `UNIQUE (batch_session_id, player_id)`

Deleting a Session deletes its attendance rows first, then the Session, in one transaction. Foreign keys stay `ON DELETE RESTRICT`.

## Create rules

Shared by accept, manual add, and renew. One transaction. Any failure rolls back. No Player row is left without the Enrollment, and a failed accept leaves the Registration pending.

`valid_from` defaults to today in the form. The Owner may change it. It must be a real calendar date, today or earlier. `valid_until` from the term must be today or later. A future start and an already-finished term are rejected.

The new inclusive range must not share a day with any Enrollment for that Player and Batch, using effective `valid_until`. Idle days after a lapsed term are allowed. A range that sits entirely in the past is rejected. While any Enrollment on that pair has an open pause, the create is rejected.

On the player key `(academy_id, full_name_normalized, phone)`: link the existing Player and keep the stored name, date of birth, Guardian, and email. If that Player has no Guardian and this intake has Guardian name and phone, copy them. If that Player has no email and this intake has an email, copy it. Otherwise insert. A unique-key conflict inside the transaction links the row that won the race.

Accept copies the Registration’s snapshotted days per week, term days, and fee. It sets `registration_id` and leaves `renewed_from_enrollment_id` null. Guardian is copied from the Registration when both Guardian fields are present and the Player has none. Contact email is copied from the Registration when present and the Player has none. Accept does not recompute age.

Manual add and renew copy days per week, term days, and fee from a fee option on that Batch, including one that is no longer offered. The Enrollment does not store the fee-option id. The Batch may be closed for Registration. A Batch with no fee option at all cannot be used. `registration_id` is null.

Manual add decides under-18 with `isPlayerUnder18` as of today. Under 18 requires Guardian name and phone. An adult intake leaves Guardian null. `valid_from` does not change the age check. The Player’s phone is the Guardian phone when under 18, otherwise the Player phone. Same contact rule as a Registration. Optional email may be set on create; on link, fill-if-empty only.

Renew is offered on a lapsed Enrollment when no Enrollment for that Player and Batch is Active or paused. `renewed_from_enrollment_id` points at the Enrollment the Owner renewed. Accept and manual add do not set it.

A second Registration for a name and phone that already has an Active or paused Enrollment on that Batch may still be submitted. Accept then fails the overlap or open-pause check and the Registration stays pending. The Owner rejects it. Public submit is unchanged.

## Pause and resume

Pause is rejected when the Enrollment is lapsed or already paused, using computed state.

The first paused day is on or after `valid_from` and today or earlier. A dated last day is on or after the first day and may fall after `valid_until`. Omit the last day for an open-ended pause.

When the dated last day is already before today, the command inserts the row with `resumed_on` set and extends `valid_until` immediately. The Enrollment is not paused after that save.

Resume requires an open pause. It sets `resumed_on` to today, extends `valid_until` by the paused days, and leaves `planned_last_paused_on` as the Owner typed it. There is no Owner-chosen resume date.

## Session attendance

The date is today or earlier. With no Session row, the list is Players with an Enrollment on that Batch that covers the date and is not paused on that date. A lapsed Enrollment can appear on a past date inside its old range. A backdated Enrollment appears on an unsaved past date. It does not appear on a Session already saved.

The save body is the Player ids that were on screen, and the subset marked present. Present ids must be a subset of that list.

- **No Session yet.** Settle, recompute eligibility, and reject when the id set differs ([ADR-0038](../adr/0038-attendance-save-rejects-a-stale-list.md)). When it matches, insert the Session and one attendance row per Player. Present marks are `present`. Everyone else on the list is `absent`. An empty eligible list may be saved: a Session with no attendance rows.
- **Session exists.** The id set must equal the stored attendance rows. A match updates marks only. Players are not added or removed.

Discard deletes that Session and its attendance. The next open shows the live list.

Marks start unmarked. Nothing is pre-checked present.

## Reads

| Surface | Who |
| --- | --- |
| Academy directory | Every Player at the Academy |
| Batch roster | Players with an Active or paused Enrollment on that Batch |
| Player detail | Every Enrollment, with Active, paused, or lapsed |
| Inbox | Pending Registrations only |

Search is one query string. A value that parses as a full phone matches `players.phone` exactly. A value that is only digits matches the end of that phone. Any other value is a case-insensitive substring of `full_name`.

Order: inbox by `created_at` descending. Directory, roster, and attendance by `full_name`, then id. Enrollments on a Player by `valid_from` descending.

## HTTP

Owner menu gains **Registrations** (`/app/registrations`) and **Players** (`/app/players`). Roster and attendance are reached from the Batch and the Player. Pages load through the lib modules. Mutations:

| Method and path | Body | Impersonation action |
| --- | --- | --- |
| `POST /api/registrations/[registrationId]/accept` | `{ validFrom }` | `registration.accept` |
| `POST /api/registrations/[registrationId]/reject` | none | `registration.reject` |
| `POST /api/players` | manual-add fields | `player.manual-add` |
| `POST /api/enrollments/[enrollmentId]/pause` | `{ pausedOn, plannedLastPausedOn }` | `enrollment.pause` |
| `POST /api/enrollments/[enrollmentId]/resume` | none | `enrollment.resume` |
| `POST /api/enrollments/[enrollmentId]/renew` | `{ feeOptionId, validFrom }` | `enrollment.renew` |
| `PUT /api/batches/[batchId]/sessions/[date]` | `{ playerIds, presentPlayerIds }` | `batch-session.save` |
| `DELETE /api/batches/[batchId]/sessions/[date]` | none | `batch-session.discard` |

`plannedLastPausedOn` is `null` for an open-ended pause. `[date]` is `YYYY-MM-DD`.

Command errors use the existing `{ error }` JSON shape. Shared codes: `invalid-input`, `not-found`, `not-pending`, `term-not-covering-today`, `overlaps`, `paused`, `lapsed`, `already-paused`, `not-paused`, `fee-option-not-found`, `stale-list`, `session-date`. Overlap, open pause, and a term that does not cover today are distinct codes so the form can say which rule failed. A stale attendance list is `409` with `stale-list`.

## Tests

HTTP, against the route handlers, with `academyId` isolation on every read and write:

- Accept creates a Player and an Enrollment. A second accept for the same person on another Batch links the Player. Reject then allows that visitor to submit again.
- Accept of a coverage that overlaps, or of a pair with an open pause, leaves the Registration pending and writes no Player.
- Manual add writes no Registration. An under-18 add copies Guardian. Linking keeps a Guardian and email already stored. Accept and manual add copy email onto the Player only when the Player has none.
- Pause excludes the Player from a Session on a paused day. Resume extends `valid_until` by the paused days and not the resume day. A dated pause whose last day is in the past is Active on the next read without a resume button.
- The first save stores present and absent for the list shown. A second save changes marks and does not add a Player. A mismatched id set returns `stale-list`. Discard removes the Session.
- Owner A cannot read or mutate Owner B’s rows.
