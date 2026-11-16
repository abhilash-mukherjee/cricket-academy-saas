# Issue #107 — Brochure: Instagram link and floating WhatsApp chat CTA

Blueprint for extending the Brochure editor (`/app/brochure`) and public Brochure (`/a/{academy-slug}`) with an optional Instagram profile link and an optional floating WhatsApp chat CTA. Parent spec: [#107](https://github.com/abhilash-mukherjee/cricket-academy-saas/issues/107).

Amends [issue #1 vertical](./issue-1-vertical.md) and [issue #104 brochure appearance](./issue-104-brochure-appearance.md). Domain language follows `CONTEXT.md`. Trade-offs already recorded: [ADR-0020](../adr/0020-fixed-brochure-template.md), [ADR-0026](../adr/0026-v1-domain-schema.md), [ADR-0028](../adr/0028-public-academy-pages-performance-profiles.md), [ADR-0032](../adr/0032-phone-parsed-to-canonical-e164.md).

After implementation, `db/domain-schema.ts` and migrations are canonical; update this doc when the schema changes intentionally.

## Conventions

- Same as the other blueprints: uuid keys, `academy_id` isolation (`resolveOwnerContext`, never from client input), `ON DELETE RESTRICT`.
- Impersonation writes call `recordOwnerWriteIfImpersonating(context, action, metadata?)` after commit.
- Mutations affecting public `/a/{slug}` output call `revalidatePublicAcademyPages(slug)` ([ADR-0028](../adr/0028-public-academy-pages-performance-profiles.md)).

## Changes to existing tables

### `academies` (`db/domain-schema.ts` + Drizzle migration `0015_brochure_instagram_whatsapp.sql`)

Add:

| Column | Type | Notes |
| --- | --- | --- |
| `instagram_handle` | `text` nullable | Canonical Instagram handle (`1–30` letters, digits, `.`, `_`), case preserved as typed/extracted; empty/blank saves as `null` |
| `whatsapp` | `text` nullable | Canonical E.164 Phone ([ADR-0032](../adr/0032-phone-parsed-to-canonical-e164.md)); empty/blank saves as `null` |

Drizzle column definitions:

- `instagramHandle: text("instagram_handle")`
- `whatsapp: text("whatsapp")`

**Constraints**

```ts
check(
  "academies_instagram_handle_format",
  sql`${table.instagramHandle} is null or ${table.instagramHandle} ~ '^[A-Za-z0-9._]{1,30}$'`,
)
```

`"Same as phone"` is derived in the Brochure editor UI (`Boolean(brochure.phone && brochure.whatsapp && brochure.phone === brochure.whatsapp)`) and is not stored as a separate column.

## Shared modules & constants

### `lib/constants.ts`

Export the global WhatsApp pre-filled inquiry template:

```ts
export const WHATSAPP_CHAT_MESSAGE_TEMPLATE =
  "I want to know more about {academy_name}";
```

### `lib/instagram.ts`

Exports constants and helpers for parsing, validating, and formatting Instagram inputs:

- `INSTAGRAM_INVALID_COPY = "Enter a valid Instagram handle or profile URL."`
- `INSTAGRAM_HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/`
- `RESERVED_INSTAGRAM_SEGMENTS`: non-profile first path segments rejected when parsing an Instagram URL (`"p"`, `"reel"`, `"reels"`, `"stories"`, `"explore"`, `"tv"`, `"accounts"`, `"direct"`, `"about"`, `"legal"`, `"developer"`, `"press"`, `"api"`, `"static"`, `"graphql"`, `"web"`, `"tags"`, `"locations"`, `"directory"`, `"emails"`, `"session"`, `"challenge"`).
- `instagramProfileUrl(handle: string): string` → `` `https://www.instagram.com/${handle}` ``
- `parseInstagramHandle(input: string): string | null`:
  - Trim `input`; if empty, return `null`.
  - **Bare or `@`-prefixed handle**: when the trimmed string does not contain `/` and does not look like a URL/domain (`!trimmed.includes("://")` and `!/^(?:www\.|m\.)?instagram\.com\b/i.test(trimmed)`):
    - Strip a single leading `@` if present (`trimmed.startsWith("@") ? trimmed.slice(1) : trimmed`).
    - Return the candidate if it matches `INSTAGRAM_HANDLE_PATTERN` (`^[A-Za-z0-9._]{1,30}$`), preserving letter casing; otherwise return `null`.
  - **URL input**:
    - Accept `http:` or `https:` URLs (and schemeless inputs starting with `instagram.com/`, `www.instagram.com/`, or `m.instagram.com/` by prepending `https://`).
    - Require hostname (case-insensitive) to be `instagram.com`, `www.instagram.com`, or `m.instagram.com`; reject all other hosts.
    - Split `url.pathname` on `/` and drop empty segments (`const segments = url.pathname.split("/").filter(Boolean)`).
    - Require `segments.length >= 1`.
    - Let `rawHandle = segments[0].startsWith("@") ? segments[0].slice(1) : segments[0]`.
    - Reject if `RESERVED_INSTAGRAM_SEGMENTS.has(rawHandle.toLowerCase())`.
    - Reject if any subsequent segment is `"p"`, `"reel"`, `"reels"`, `"tv"`, or `"stories"` (e.g. `/elite_cricket/p/ABC123` or `/elite_cricket/reel/ABC123`).
    - Return `rawHandle` if `INSTAGRAM_HANDLE_PATTERN.test(rawHandle)`, else `null`.
- `normalizeOptionalInstagram(value: string | null | undefined): { ok: true; instagramHandle: string | null } | { ok: false }`:
  - Trim `value`; if `""`, return `{ ok: true, instagramHandle: null }`.
  - Otherwise call `parseInstagramHandle(trimmed)`; if non-null return `{ ok: true, instagramHandle }`, else `{ ok: false }`.

### WhatsApp deep link construction

Given canonical E.164 `whatsapp` (e.g. `"+919876543210"`) and Academy `name`:

- Strip leading `+`: `const digits = whatsapp.replace(/^\+/, "")`
- Interpolate message: `const message = WHATSAPP_CHAT_MESSAGE_TEMPLATE.replace("{academy_name}", name)`
- Deep link URL: `` `https://wa.me/${digits}?text=${encodeURIComponent(message)}` ``

## Data layer contracts

### `lib/brochure.ts`

`BrochureEditorState` adds:

- `instagramUrl: string | null` (`instagramProfileUrl(academy.instagramHandle)` when `academy.instagramHandle` is non-null, else `null`, matching how `youtubeUrls` are hydrated in `getBrochureEditor`)
- `whatsapp: string | null` (`academy.whatsapp`)

`getBrochureEditor(academyId)` selects `instagramHandle` and `whatsapp` from `academies` and maps `instagramHandle` to `instagramUrl`.

`BrochureEditInput` adds optional fields:

- `instagram?: string | null`
- `whatsapp?: string | null`

`BrochureEditError` adds:

- `"invalid-instagram"`

`updateBrochure(academyId, input)` applies preserve-when-`undefined` semantics for `instagram` and `whatsapp` so existing partial callers do not clear stored values when those keys are omitted:

- `whatsapp`: when `input.whatsapp !== undefined`, validate with `normalizeOptionalPhone(input.whatsapp)`. On failure, log warning and return `{ ok: false, error: "invalid-phone" }`. When `undefined`, keep existing `academies.whatsapp`.
- `instagram`: when `input.instagram !== undefined`, validate with `normalizeOptionalInstagram(input.instagram)`. On failure, log warning and return `{ ok: false, error: "invalid-instagram" }`. When `undefined`, keep existing `academies.instagramHandle`.
- Include `whatsapp` and `instagramHandle` in `academyUpdate` only when their respective input was defined.

### `lib/public-brochure.ts`

`PublicBrochure` adds:

- `instagramHandle: string | null`
- `whatsapp: string | null`

`loadPublicBrochure(slug)` selects `instagramHandle` and `whatsapp` from `academies` and returns them on `PublicBrochure`.

`getCachedPublicBrochure(slug)`:

- Bump `unstable_cache` key array (e.g. `["public-brochure", slug, "appearance-v1", "batch-registration-v1", "social-v1"]`).
- Normalize `instagramHandle: cached.instagramHandle ?? null` and `whatsapp: cached.whatsapp ?? null`.

### `lib/public-conversion.ts`

Unchanged. Neither `instagramHandle` nor `whatsapp` is loaded or rendered on `/a/{academy-slug}/join`, and `whatsapp` never acts as a fallback when online Registration is off.

## HTTP

### `POST /api/brochure` (`app/api/brochure/route.ts`)

- `BrochureBody` accepts optional `instagram?: string | null` and `whatsapp?: string | null`.
- Pass `instagram: body.instagram === null || body.instagram === undefined ? null : String(body.instagram)` only when `Object.hasOwn(body, "instagram")`, and `whatsapp: body.whatsapp === null || body.whatsapp === undefined ? null : String(body.whatsapp)` only when `Object.hasOwn(body, "whatsapp")`.
- Status codes: `not-found` → `404`, `invalid-storage-key` → `403`, `gallery-limit` → `409`, `invalid-input` / `invalid-phone` / `invalid-instagram` / `invalid-youtube-url` → `400`.
- On success: `recordOwnerWriteIfImpersonating(context, "brochure.update")` and `revalidatePublicAcademyPages(context.academy.slug)`.

## Screens & components

### Brochure Editor (`app/app/brochure/brochure-editor.tsx`)

State & initial values:

- `whatsapp`: initialized to `brochure.whatsapp ?? ""`
- `whatsappSameAsPhone`: initialized to `Boolean(brochure.phone && brochure.whatsapp && brochure.phone === brochure.whatsapp)`
- `instagram`: initialized to `brochure.instagramUrl ?? ""`

Form fields in order (immediately after `Phone` and before `Gallery images`):

1. `Phone` (`input[name="phone"]`):
   - `onChange`: updates `phone` to `nextPhone`; if `whatsappSameAsPhone` is `true`, also updates `whatsapp` to `nextPhone`.
2. `WhatsApp`:
   - Label `"WhatsApp"` with `input[name="whatsapp"]` (`placeholder="+919876543210"`, `value={whatsapp}`).
   - `onChange`: updates `whatsapp` to `nextWhatsapp`; if `whatsappSameAsPhone` is `true` and `nextWhatsapp !== phone`, sets `whatsappSameAsPhone` to `false`.
   - Directly below the input, a checkbox labeled `"Same as phone"` (`input[type="checkbox"][name="whatsappSameAsPhone"]`, `checked={whatsappSameAsPhone}`):
     - When checked (`nextChecked === true`): sets `whatsappSameAsPhone` to `true` and sets `whatsapp` to `phone`.
     - When unchecked (`nextChecked === false`): sets `whatsappSameAsPhone` to `false` (leaving `whatsapp` at its current value so the Owner can edit or clear it).
3. `Instagram`:
   - Label `"Instagram"` with `input[name="instagram"]` (`placeholder="https://www.instagram.com/..."`, `value={instagram}`).

Error copy (`errorCopy(error)`):

- `"invalid-instagram"` → `INSTAGRAM_INVALID_COPY` (`"Enter a valid Instagram handle or profile URL."`)
- `"invalid-phone"` → `PHONE_INVALID_COPY` (`"Enter a valid phone number."`)

Live preview (`preview: PublicBrochure`):

- `instagramHandle: parseInstagramHandle(instagram)` (renders in preview only when valid, matching `youtubeUrls`).
- `whatsapp: normalizedWhatsapp.ok ? normalizedWhatsapp.phone : null` (where `normalizedWhatsapp = normalizeOptionalPhone(whatsapp)`).
- Pass `floatingPlacement="frame"` to `<BrochureView brochure={preview} floatingPlacement="frame" />` so the floating WhatsApp CTA stays contained within the preview box.

Save payload (`save()`):

- Include `whatsapp` and `instagram` in the `POST /api/brochure` JSON body.

### Public Brochure (`app/a/[academySlug]/brochure-view.tsx`, `brochure-instagram.tsx`, `brochure-whatsapp.tsx`)

- **`BrochureViewProps`**:
  - `brochure: PublicBrochure`
  - `floatingPlacement?: "viewport" | "frame"` (defaults to `"viewport"`)
- **Root container (`[data-brochure-root]`)**:
  - Add `relative` to `[data-brochure-root]` (`className="@container relative bg-base-100 text-base-content"`) so `floatingPlacement="frame"` positions the WhatsApp button relative to the Brochure root inside the editor preview container.
- **Hero metadata row (`BrochureView` + `brochure-instagram.tsx`)**:
  - Render the metadata row when `brochure.location || brochure.phone || brochure.instagramHandle`.
  - Order inside the row: `BrochureLocation` → `BrochurePhone` → `BrochureInstagram`.
  - `BrochureInstagram` (`app/a/[academySlug]/brochure-instagram.tsx`):
    - Renders `<p className="flex items-start gap-2">` with an Instagram SVG icon (`mt-0.5 size-5 shrink-0`, `aria-hidden="true"`) and:
      ```tsx
      <a
        className="link"
        href={instagramProfileUrl(instagramHandle)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Follow us on Instagram
      </a>
      ```
- **Floating WhatsApp CTA (`brochure-whatsapp.tsx`)**:
  - Rendered inside `BrochureView` when `brochure.whatsapp` is non-null; omitted when `null`.
  - Positioning class:
    - `floatingPlacement === "viewport"` (default on `/a/{academy-slug}`): `"fixed right-6 bottom-6 z-30"`
    - `floatingPlacement === "frame"` (in `BrochureEditor` preview): `"absolute right-6 bottom-6 z-30"`
  - Renders an `<a>` linking to `https://wa.me/${digits}?text=${encodedMessage}` with `target="_blank" rel="noopener noreferrer"`:
    - Styled as a WhatsApp-green pill button (`className="btn rounded-full border-none bg-[#25D366] text-white shadow-lg hover:bg-[#20bd5a] gap-2"`).
    - Contains a WhatsApp chat SVG icon (`size-5 shrink-0`, `aria-hidden="true"`) and `<span>Chat with us</span>`.
- **Strict separation of Phone vs. WhatsApp**:
  - `BrochureHeader` / `BrochureMenu` continues to receive only `brochure.phone` (never `whatsapp` or `instagramHandle`).
  - `HeroCta` continues to receive only `brochure.phone` (never `whatsapp`).
  - Conversion page (`/a/{academy-slug}/join`) renders neither Instagram nor the floating WhatsApp button, and its closed/off fallback uses only `conversion.phone`.

## Tests

### Unit & component seam tests (`lib/instagram.test.ts`, `app/a/[academySlug]/brochure.test.tsx`, `db/schema.test.ts`)

- `lib/instagram.test.ts`:
  - Accepts bare handles (`elite_cricket`), `@`-prefixed handles (`@elite_cricket`), and profile URLs (`https://www.instagram.com/elite_cricket`, `https://instagram.com/elite_cricket/`, `https://m.instagram.com/elite_cricket?igsh=123`, `instagram.com/Elite.Cricket_99`).
  - Preserves handle letter casing and enforces `1–30` characters (`[A-Za-z0-9._]`).
  - Rejects non-profile Instagram URLs (`/p/...`, `/reel/...`, `/reels/...`, `/stories/...`, `/explore/...`, `/elite_cricket/p/123`), non-Instagram domains, handles > 30 chars or with invalid characters, and empty paths (`https://www.instagram.com/`).
- `app/a/[academySlug]/brochure.test.tsx`:
  - Renders `Follow us on Instagram` in the hero metadata row linking to `https://www.instagram.com/{handle}` with `target="_blank"` and `rel="noopener noreferrer"` when `instagramHandle` is set, and omits it when `null` (and never renders it in the hamburger menu).
  - Renders the floating `Chat with us` link when `whatsapp` is set, verifying the `https://wa.me/{digits}?text={encoded}` URL interpolated from `WHATSAPP_CHAT_MESSAGE_TEMPLATE` with `brochure.name`, `fixed` positioning when `floatingPlacement` is `"viewport"` (default), and `absolute` positioning when `floatingPlacement="frame"`.
  - Verifies that setting `whatsapp` with `phone: null` and `isIntakeAvailable: false` does not render the `Contact Us` hero fallback CTA or the hamburger `Contact:` item.
  - Verifies that `BrochureEditor` syncs `Phone` into `WhatsApp` when `"Same as phone"` is checked, allows a separate `WhatsApp` number when unchecked, and populates saved `instagramUrl` (`https://www.instagram.com/{handle}`) and `whatsapp` on reload.
- `db/schema.test.ts`:
  - Verifies migration `0015_brochure_instagram_whatsapp.sql` adds `instagram_handle`, `whatsapp`, and `CONSTRAINT "academies_instagram_handle_format"` without destructive DDL.

### HTTP / App Router flow tests (`app/api/brochure/brochure-editor-flow.test.ts`, `app/api/public-academy-cache-invalidation.test.ts`)

- Saving valid `instagram` (bare handle, `@handle`, profile URL) and `whatsapp` via `POST /api/brochure`, persisting canonical `instagram_handle` and E.164 `whatsapp`, and returning `instagramUrl: "https://www.instagram.com/{handle}"` and `whatsapp` from `getBrochureEditor`.
- Clearing `instagram` and `whatsapp` back to `null` when saved with `""`, and preserving existing values when `instagram` or `whatsapp` keys are omitted from a partial `POST /api/brochure` payload.
- Rejecting invalid `instagram` with `400 { error: "invalid-instagram" }` and invalid `whatsapp` with `400 { error: "invalid-phone" }`.
- Recording `brochure.update` in `impersonation_audit_events` when an impersonating Super-admin updates Instagram or WhatsApp, and invalidating the cached public Brochure page (`revalidatePublicAcademyPages`).
