# Issues #95 and #96 — Coach directory and Coach attendance

Blueprint for the Coach directory and Coach attendance. Parent specs: [#95](https://github.com/abhilash-mukherjee/cricket-academy-saas/issues/95), [#96](https://github.com/abhilash-mukherjee/cricket-academy-saas/issues/96). Language is `CONTEXT.md`. Trade-offs already recorded: [ADR-0043](../adr/0043-coach-is-not-a-coach-profile.md), [ADR-0044](../adr/0044-coach-attendance-is-not-a-session.md). Writes that delete marks and the Coach in one commit use a transaction ([ADR-0024](../adr/0024-neon-http-not-session-locks.md)).

`coach_profiles` stays the brochure card. This file does not change it.

#95 ships `coaches` and the directory. #96 adds `coach_attendance` and changes the body of `removeCoach`. Callers of `removeCoach` stay the same.

After implementation, `db/domain-schema.ts` and migrations are canonical; update this doc when the schema changes intentionally.

## Conventions

Same as the other blueprints: uuid keys, `academy_id` on every Academy-scoped row ([ADR-0008](../adr/0008-academy-id-shared-schema.md)), `ON DELETE RESTRICT`, Zod for new request bodies ([ADR-0030](../adr/0030-zod-for-validation.md)).

**Today** is the Asia/Kolkata calendar date from `calendarDateInIst` in `lib/player-age.ts`. Stored attendance days are `date` values, `YYYY-MM-DD`.

Every function takes `academyId` from `resolveOwnerContext`. The client never supplies it. A Super-admin must be impersonating. A successful change calls `recordOwnerWriteIfImpersonating` after the commit. A failed attempt does not. A Coach attendance write that leaves the stored mark as it was is not a change.

## Repo layout

- `lib/coaches.ts` — list, add, rename, remove
- `lib/coach-attendance.ts` — one mark, one month, mark, clear (#96)
- `getDb()` for the directory commands and for mark, clear, and reads
- `removeCoach` in #96 uses `getTransactionalDb()` so the mark delete and the Coach delete commit together

Screens live under `app/app/coaches/`. The column is the same phone column as Dashboard and Players (`max-w-lg`). The dashboard is unchanged, including the Coach profiles line.

## New tables

### `coaches` (#95)

A named person in the Coach directory. Not a login, not a `coach_profiles` row.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `academy_id` | `uuid NOT NULL` FK → `academies` | |
| `name` | `text NOT NULL` | Trimmed typed name. Shown as stored |
| `created_at` / `updated_at` | `timestamptz` | |

**Constraints**

- `UNIQUE (academy_id, lower(btrim(name)))` — `coaches_academy_id_name_unique`. Same shape as Batch names. No separate normalized column
- `CHECK (char_length(name) BETWEEN 1 AND 200)` — `coaches_name_length`. The stored value is already trimmed

List order is lowercased name, then stored name, then id.

### `coach_attendance` (#96)

One mark: one Coach, one Batch, one calendar date. There is no row for an unmarked day. Present is `is_present = true`. Absent is `is_present = false`. Clear deletes the row. A second mark for the same Coach, Batch, and date replaces the boolean.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `academy_id` | `uuid NOT NULL` FK → `academies` | |
| `coach_id` | `uuid NOT NULL` FK → `coaches` | |
| `batch_id` | `uuid NOT NULL` FK → `batches` | The Batch, not its name. A rename keeps the mark |
| `marked_on` | `date NOT NULL` | Today or earlier |
| `is_present` | `boolean NOT NULL` | No default |
| `created_at` / `updated_at` | `timestamptz` | |

**Constraint:** `UNIQUE (academy_id, coach_id, batch_id, marked_on)`

The unique key is the month read. Any Batch at the Academy can be marked, including one closed for Registration or with no Players. No Session row is required. Discarding a Session leaves these rows in place.

## `removeCoach`

#95 deletes the `coaches` row for this Academy. Zero rows is `not-found`.

#96 does that inside one transaction: delete this Coach's `coach_attendance` rows for this Academy, then delete the Coach. If the Coach row is not there, the transaction leaves attendance unchanged and returns `not-found`. Foreign keys stay `ON DELETE RESTRICT`.

The delete request does not carry the typed name. The directory dialog is what requires that name.

## Screens

Owner menu gains **Coaches** immediately after **Players**, linking to `/app/coaches`, with `LinkPendingMark`. Highlight only on that exact path.

`/app/coaches` lists every Coach of this Academy. The name field and Add stay at the top, including when the list is empty. A successful add stays on this page, clears the field, and reloads the list so the new card appears in order. A rejected add leaves the list and the typed name as they were.

Each card links the stored name to `/app/coaches/[coachId]` with `LinkPendingMark`, and has Delete. Delete opens one dialog. The warning is "This Coach and their Coach attendance will be removed." The hint is the stored name. Confirm stays disabled until the typed value, trimmed at the ends, equals that name, including capitals and internal spaces. Cancel closes the dialog and leaves the card. A successful delete reloads the list. If the name on screen is stale, the delete still removes the Coach.

`/app/coaches/[coachId]` shows the stored name, a back link to `/app/coaches` with `LinkPendingMark`, and a separate save. Save renames that Coach. Leaving without saving keeps the stored name. An unknown Coach for this Academy is not found. Add, save, and Confirm show a spinner and ignore further taps until that write finishes.

Both routes use the staff loading spinner (`app/app/loading.tsx`).

#96 adds the attendance block on the Coach page, under the rename block. Mark date, mark Batch, month, and month Batch live in client state. Opening the Coach from the directory starts them over: mark date is today, mark Batch is empty, month is the current month, month Batch is empty.

Mark date is `<input type="date">` with no earliest date. Month is `<input type="month">`. Each Batch select lists every Batch from `listBatches`, in that order. The first option is empty.

With a mark Batch chosen, changing the date or the Batch loads that one mark and shows Present, Absent, or no mark. Present, Absent, and Clear commit immediately. The date and Batch stay. The mark just saved is the one shown.

The page does not send Present when the mark is already present, Absent when it is already absent, or Clear when there is no mark. A future mark date does not send those either, and the page does not say the write failed.

With no Batches, rename and remove still work. The selects have no Batch, and attendance cannot be marked.

The month's present dates, absent dates, and the two counts appear once a month Batch is chosen. They are read-only, two stacked lists. Dates use `formatCalendarDate` and run from the start of the month. Unmarked days are omitted. No marks: both counts are 0 and both lists are empty. There is no cross-batch total. A future month is empty.

After a successful mark or clear, if that Batch is the month Batch and that date falls in the month on screen, update the two lists and the two counts in place. Otherwise leave the month as it is.

Present, Absent, Clear, and the other write buttons show a spinner and ignore further taps until that write finishes. Links on the Coach page use `LinkPendingMark`.

## HTTP

| Method and path | Body | Impersonation action |
| --- | --- | --- |
| `POST /api/coaches` | `{ name }` | `coach.add` `{ coachId }` |
| `PATCH /api/coaches/[coachId]` | `{ name }` | `coach.rename` `{ coachId }` |
| `DELETE /api/coaches/[coachId]` | none | `coach.remove` `{ coachId }` |
| `GET /api/coaches/[coachId]/attendance/[batchId]/[markedOn]` | none | none |
| `PUT /api/coaches/[coachId]/attendance/[batchId]/[markedOn]` | `{ isPresent }` | `coach-attendance.mark` when `changed` |
| `DELETE /api/coaches/[coachId]/attendance/[batchId]/[markedOn]` | none | `coach-attendance.clear` when `changed` |
| `GET /api/coaches/[coachId]/attendance?batchId=&month=` | none | none |

`[markedOn]` is `YYYY-MM-DD`. `month` is `YYYY-MM`. Mark and clear return `{ ok: true, changed }`. The one-mark read returns `{ isPresent: true | false | null }`. The month read returns the present dates, the absent dates, `presentCount`, and `absentCount`.

`name-taken` is 409. `invalid-input` and `future-date` are 400. `not-found` is 404. Another Academy's Coach or Batch is `not-found`.

Add and rename trim the name, then reject blank or over 200 characters as `invalid-input`. A unique-index conflict is `name-taken`. Changing only capitals on the same Coach is allowed. `markCoachAttendance` and `clearCoachAttendance` take `today`, defaulting to `calendarDateInIst()`. A future `markedOn` is `future-date` and writes nothing. An invalid date is `invalid-input`. When the stored boolean is already the requested value, or clear finds no row, the result is `{ ok: true, changed: false }` and there is no audit.

## Copy

- Blank: "Coach name is required."
- Over 200 characters: "Coach name must be at most 200 characters."
- Duplicate: "That name is already used."
- Any other failed add, rename, remove, mark, or clear: "The write failed."

## Tests

HTTP, against the route handlers, with `academyId` isolation on every read and write. One flow test in the style of `app/api/batches/owner-batches-flow.test.ts`.

#95:

- Add and list order. Another Academy's Coaches are absent.
- Blank, 201 characters, and a case-insensitive duplicate leave the list as it was.
- Case-only rename succeeds. A rename collision leaves the stored name.
- Delete takes no name. That name can be added again.
- Add, rename, and remove work with no Batches.
- An impersonated success audits. A failure does not.

#96:

- One Coach can be present for one Batch and absent for another on the same day. Two Coaches can be present for the same Batch on the same day.
- A second mark replaces the first. The same value, and clear when there is no row, return `changed: false` and write no audit.
- A future date writes nothing.
- A month returns only that Batch's dates and counts. A future month is empty. A renamed Batch keeps its marks. Discarding a Session leaves the marks.
- Removing the Coach deletes the marks.
- No Batches still allows rename and remove.
- An impersonated mark or clear audits only when `changed` is true. Another Academy cannot mark or read.
