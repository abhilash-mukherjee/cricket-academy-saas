# Issue #1 vertical — domain schema (v1)

Blueprint for the first vertical's Postgres schema. Parent spec: [#1](https://github.com/abhilash-mukherjee/cricket-academy-saas/issues/1). Trade-offs: [ADR-0026](../adr/0026-v1-domain-schema.md), [ADR-0029](../adr/0029-fee-option-intensity.md).

After implementation, `db/domain-schema.ts` and migrations are canonical; update this doc when the schema changes intentionally.

## Conventions

- **Primary keys:** `uuid`, default `gen_random_uuid()`
- **Timestamps:** `created_at timestamptz NOT NULL DEFAULT now()` on all tables; `updated_at` on mutable domain rows
- **Tenant isolation:** every Academy-scoped row carries `academy_id` (ADR-0008)
- **Foreign keys:** `ON DELETE RESTRICT` on all FKs
- **Phones:** normalized to E.164 on write in the data layer
- **Files:** store `storage_key text` (object-storage path); app resolves to a URL

## Repo layout

- `db/auth-schema.ts` — Better Auth tables (`user`, `session`, `account`, `verification`) plus `user.is_super_admin`
- `db/domain-schema.ts` — domain tables below
- `db/schema.ts` — re-exports both for the Drizzle client

Drop the `schema_bootstrap` marker table in the first real domain migration.

## Auth tables (Better Auth)

Generated via Better Auth CLI, extended with one additional field. Configure Better Auth to use UUID primary keys (not text).

### `user`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `name` | `text` | Display name from onboarding wizard |
| `email` | `text` UNIQUE | |
| `email_verified` | `boolean` | |
| `image` | `text` nullable | |
| `is_super_admin` | `boolean NOT NULL DEFAULT false` | Additional field |
| `created_at` / `updated_at` | `timestamptz` | |

### `session`, `account`, `verification`

Standard Better Auth shape. Magic-link only in v1; `account` is likely unused.

**Not in the database:** active impersonation state (session/cookie only). Meaningful writes during impersonation are logged in `impersonation_audit_events`.

**Onboarding gate (app layer, not schema):** route to wizard when the user is not `is_super_admin` and owns no Academy (`academies.owner_user_id`).

## Domain tables

### `academies`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `name` | `text NOT NULL` | Editable |
| `slug` | `text NOT NULL` | Immutable in app layer after create |
| `tagline` | `text` nullable | |
| `location` | `text` nullable | |
| `phone` | `text` nullable | E.164; brochure CTA when online Registration is off |
| `is_online_registration_allowed` | `boolean NOT NULL DEFAULT true` | |
| `is_active` | `boolean NOT NULL DEFAULT true` | `false` → public pages 404; slug stays reserved |
| `owner_user_id` | `uuid` nullable FK → `user` | Set on wizard complete or claim |
| `pending_owner_email` | `text` nullable | Super-admin assign; cleared on claim |
| `upi_qr_storage_key` | `text` nullable | |
| `created_at` / `updated_at` | `timestamptz` | |

**Indexes / constraints**

- `UNIQUE (slug)`
- `CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')`
- `UNIQUE (owner_user_id) WHERE owner_user_id IS NOT NULL`
- Index on `(is_active)` for sitemap queries

### `batches`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `academy_id` | `uuid NOT NULL` FK → `academies` | |
| `name` | `text NOT NULL` | Stored as typed after trim |
| `blurb` | `text` nullable | Brochure display-only |
| `is_open_for_registration` | `boolean NOT NULL DEFAULT false` | |
| `created_at` / `updated_at` | `timestamptz` | |

**Ordering:** `created_at` (no `sort_order` in v1).

**Constraints:** `UNIQUE (academy_id, lower(btrim(name)))` — unique at the Academy after trim and case fold; public pages show the stored name.

A Batch is registrable only when it has at least one offered `batch_fee_option` and `is_open_for_registration = true`.

### `batch_fee_options`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `academy_id` | `uuid NOT NULL` FK → `academies` | |
| `batch_id` | `uuid NOT NULL` FK → `batches` | |
| `days_per_week` | `integer NOT NULL` | Intensity count 1–7; not named weekdays |
| `term_months` | `integer NOT NULL` | e.g. 1, 3, 6 |
| `fee_paise` | `integer NOT NULL` | Total fee for that package (INR × 100) |
| `label` | `text` nullable | Display name only; not identity |
| `is_offered` | `boolean NOT NULL DEFAULT true` | `false` hides from conversion; row kept for history |
| `sort_order` | `integer NOT NULL` | Conversion page order |
| `created_at` / `updated_at` | `timestamptz` | |

**Constraints:** `UNIQUE (batch_id, days_per_week, term_months)`; `CHECK (days_per_week BETWEEN 1 AND 7)`

Trade-offs: [ADR-0029](../adr/0029-fee-option-intensity.md).

### `registrations`

Postgres enum `registration_status`: `pending` | `accepted` | `rejected`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `academy_id` | `uuid NOT NULL` FK → `academies` | |
| `batch_id` | `uuid NOT NULL` FK → `batches` | |
| `batch_fee_option_id` | `uuid NOT NULL` FK → `batch_fee_options` | Visitor’s package choice |
| `days_per_week` | `integer NOT NULL` | Snapshotted at submit |
| `term_months` | `integer NOT NULL` | Snapshotted at submit |
| `fee_paise` | `integer NOT NULL` | Snapshotted at submit |
| `player_full_name` | `text NOT NULL` | |
| `player_full_name_normalized` | `text NOT NULL` | `lower(trim(name))` on insert |
| `player_date_of_birth` | `date NOT NULL` | Age rules enforced in app |
| `guardian_full_name` | `text` nullable | Required when Player &lt; 18 (app) |
| `guardian_phone` | `text` nullable | E.164 |
| `player_phone` | `text` nullable | E.164; required when Player ≥ 18 (app) |
| `contact_phone` | `text NOT NULL` | E.164; `guardian_phone ?? player_phone` |
| `note` | `text` nullable | |
| `status` | `registration_status NOT NULL DEFAULT 'pending'` | |
| `player_id` | `uuid` nullable FK → `players` | Set on accept |
| `accepted_at` | `timestamptz` nullable | |
| `accepted_by_user_id` | `uuid` nullable FK → `user` | |
| `rejected_at` | `timestamptz` nullable | |
| `rejected_by_user_id` | `uuid` nullable FK → `user` | |
| `created_at` / `updated_at` | `timestamptz` | |

**Indexes**

- Partial unique (duplicate-pending guard):

  ```sql
  UNIQUE (academy_id, batch_id, contact_phone, player_full_name_normalized)
  WHERE status = 'pending'
  ```

- `(academy_id, status)` for inbox and dashboard pending count
- `CHECK (days_per_week BETWEEN 1 AND 7)`

Rejected rows are retained; visitors may resubmit after reject.

### `players`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `academy_id` | `uuid NOT NULL` FK → `academies` | |
| `full_name` | `text NOT NULL` | |
| `full_name_normalized` | `text NOT NULL` | |
| `phone` | `text NOT NULL` | E.164 |
| `date_of_birth` | `date NOT NULL` | |
| `created_at` / `updated_at` | `timestamptz` | |

**Constraint:** `UNIQUE (academy_id, full_name_normalized, phone)`

Accept flow: find by that key → link existing Player, else insert → create `enrollments` row.

### `enrollments`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `academy_id` | `uuid NOT NULL` FK → `academies` | |
| `player_id` | `uuid NOT NULL` FK → `players` | |
| `batch_id` | `uuid NOT NULL` FK → `batches` | |
| `registration_id` | `uuid NOT NULL` FK → `registrations` | Provenance |
| `days_per_week` | `integer NOT NULL` | From accepted Registration |
| `term_months` | `integer NOT NULL` | From accepted Registration |
| `fee_paise_paid` | `integer NOT NULL` | From accepted Registration |
| `valid_from` | `date NOT NULL` | Accept date |
| `valid_until` | `date NOT NULL` | `valid_from` + `term_months` calendar months |
| `renewed_from_enrollment_id` | `uuid` nullable FK → `enrollments` | Renewal chain |
| `created_at` / `updated_at` | `timestamptz` | |

**Constraint:** `CHECK (days_per_week BETWEEN 1 AND 7)`

No `UNIQUE (player_id, batch_id)` — history is preserved (e.g. a 3-month stint and a later 6-month renewal are separate rows).

### `brochure_images`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `academy_id` | `uuid NOT NULL` FK → `academies` | |
| `storage_key` | `text NOT NULL` | |
| `sort_order` | `integer NOT NULL` | |
| `created_at` | `timestamptz` | |

### `youtube_embeds`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `academy_id` | `uuid NOT NULL` FK → `academies` | |
| `video_id` | `text NOT NULL` | Parsed from pasted URL at write time |
| `sort_order` | `integer NOT NULL` | |
| `created_at` | `timestamptz` | |

### `coach_profiles`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `academy_id` | `uuid NOT NULL` FK → `academies` | |
| `full_name` | `text NOT NULL` | |
| `storage_key` | `text` nullable | Coach photo |
| `blurb` | `text` nullable | |
| `sort_order` | `integer NOT NULL` | |
| `created_at` | `timestamptz` | |

Display-only; no login link in v1.

### `impersonation_audit_events`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `actor_user_id` | `uuid NOT NULL` FK → `user` | Super-admin |
| `subject_user_id` | `uuid NOT NULL` FK → `user` | Owner impersonated |
| `academy_id` | `uuid NOT NULL` FK → `academies` | |
| `action` | `text NOT NULL` | e.g. `registration.accept` |
| `metadata` | `jsonb` nullable | |
| `created_at` | `timestamptz` | |

Append-only; log meaningful writes during impersonation.

## Entity relationships

```text
user ─────────────────────┬──► academies.owner_user_id
  │                       │
  ├── session/account/    ├── batches ──► batch_fee_options
  │   verification        ├── registrations ──► players
  │                       ├── enrollments ◄───┘
  └── is_super_admin      ├── brochure_images
                          ├── youtube_embeds
                          ├── coach_profiles
                          └── impersonation_audit_events
```

## App-layer rules (not DB constraints)

- Slug is immutable after create
- Guardian required when date of birth → age &lt; 18; `player_phone` required when ≥ 18
- Claim flow: when `pending_owner_email` matches signed-in `user.email`, set `owner_user_id` and clear `pending_owner_email`
- `enrollments.academy_id` must match both parent `academy_id` values
- Impersonation writes → insert `impersonation_audit_events`
- Conversion page: visitor picks an open Batch and an offered `batch_fee_option`; thank-you shows snapshotted `days_per_week`, `term_months`, `fee_paise`, and Academy UPI QR (display-only; ADR-0002)
- Duplicate-pending guard ignores fee option — one pending Registration per phone + Batch + Player name
- Accept creates an `enrollments` row with `valid_from` = accept date and `valid_until` = `valid_from` + `term_months` calendar months; copies snapshotted `days_per_week`
- Brochure does not list fees; pricing is conversion-page only
- Onboarding wizard does not require fee options; Owner adds them in batch settings before intake opens
- `days_per_week` and `term_months` are immutable after create; price, label, sort order, and `is_offered` may change
- Stop offering a package by setting `is_offered = false`; delete only when no Registration references it

## P0 (#1) vs deferred (enrollment)

| In #1 | Deferred |
| --- | --- |
| Visitor picks Batch + fee option; amount on conversion/thank-you | Expiry reminders / lapsed membership UI |
| Registration inbox shows Batch · days/week · term · fee | Renewal form / overlap handling |
| Accept writes `enrollments` with dates | Roster “active until” dashboard |
| Owner manages `batch_fee_options` in `/app/batches` | Brochure “from ₹X” pricing |

## Explicitly out of v1 schema

| Not modeled | Why |
| --- | --- |
| `guardians` table | Contact fields live on `registrations`; roster is `players` |
| `player_batches` | Replaced by `enrollments` |
| `impersonation_sessions` | Active state lives in session |
| `onboarding_drafts` | Infer from missing Academy |
| Coach auth / `sessions` (attendance) | Out of scope for #1 |
| SaaS billing / payment verification | Out of scope (ADR-0002) |
| Hard delete / cascades | Deactivate only; RESTRICT on FKs |
