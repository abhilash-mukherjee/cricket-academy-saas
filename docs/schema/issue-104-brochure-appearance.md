# Issue #104 — Brochure & Conversion page: About section, Academy logo, and theme appearance

Blueprint for extending the Brochure editor (`/app/brochure`), public Brochure (`/a/{academy-slug}`), and public Conversion page (`/a/{academy-slug}/join`). Parent spec: [#104](https://github.com/abhilash-mukherjee/cricket-academy-saas/issues/104).

Amends [issue #1 vertical](./issue-1-vertical.md). Domain language follows `CONTEXT.md`. Trade-offs already recorded: [ADR-0020](../adr/0020-fixed-brochure-template.md), [ADR-0022](../adr/0022-daisyui-styling.md), [ADR-0026](../adr/0026-v1-domain-schema.md), [ADR-0027](../adr/0027-vercel-blob-academy-assets.md), [ADR-0028](../adr/0028-public-academy-pages-performance-profiles.md).

The floating bottom CTA (`BrochureCta`) was removed in #103 and does not exist; only the Hero CTA (`HeroCta`) is styled on the Brochure.

After implementation, `db/domain-schema.ts` and migrations are canonical; update this doc when the schema changes intentionally.

## Conventions

- Same as the other blueprints: uuid keys, `academy_id` isolation (`resolveOwnerContext`, never from client input), `ON DELETE RESTRICT`.
- Impersonation writes call `recordOwnerWriteIfImpersonating(context, action, metadata?)` after commit.
- Mutations affecting public `/a/{slug}` and `/a/{slug}/join` output call `revalidatePublicAcademyPages(slug)` ([ADR-0028](../adr/0028-public-academy-pages-performance-profiles.md)).

## Changes to existing tables

### `academies` (`db/domain-schema.ts` + Drizzle migration)

Add:

| Column | Type | Notes |
| --- | --- | --- |
| `about_label` | `text NOT NULL DEFAULT 'About Us'` | Custom heading for the `#about` section; blank resets to `'About Us'` on save |
| `about` | `text` nullable | Multi-line About copy; trimmed, empty string saves as `null` |
| `logo_storage_key` | `text` nullable | Academy logo object-storage key under `academies/{academyId}/` |
| `theme_mode` | `text NOT NULL DEFAULT 'dark'` | Public DaisyUI surface mode: `'dark'` or `'light'` |
| `theme_accent` | `text NOT NULL DEFAULT 'default'` | Curated brand accent swatch |

Drizzle column definitions:

- `aboutLabel: text("about_label").notNull().default("About Us")`
- `about: text("about")`
- `logoStorageKey: text("logo_storage_key")`
- `themeMode: text("theme_mode").notNull().default("dark")`
- `themeAccent: text("theme_accent").notNull().default("default")`

**Constraints**

```ts
check("academies_about_label_not_blank", sql`btrim(${table.aboutLabel}) <> ''`)
check("academies_theme_mode_check", sql`${table.themeMode} in ('dark', 'light')`)
check(
  "academies_theme_accent_check",
  sql`${table.themeAccent} in ('default', 'emerald', 'blue', 'crimson', 'amber', 'violet', 'teal', 'orange')`,
)
```

`tagline` remains `text` nullable as the short hero subtitle.

## Theme & brand accent module

### `lib/academy-theme.ts`

Exports constants, types, type guards, and style helpers shared by server validation, the Brochure editor, `/a/{slug}`, and `/a/{slug}/join`:

- `ACADEMY_THEME_MODES = ["dark", "light"] as const` → `export type AcademyThemeMode = (typeof ACADEMY_THEME_MODES)[number]`
- `ACADEMY_THEME_ACCENTS = ["default", "emerald", "blue", "crimson", "amber", "violet", "teal", "orange"] as const` → `export type AcademyThemeAccent = (typeof ACADEMY_THEME_ACCENTS)[number]`
- `isAcademyThemeMode(value: unknown): value is AcademyThemeMode`
- `isAcademyThemeAccent(value: unknown): value is AcademyThemeAccent`

Curated swatch palette (`--color-primary` and `--color-primary-content`):

| Swatch (`themeAccent`) | Label | `--color-primary` | `--color-primary-content` |
| --- | --- | --- | --- |
| `default` | Default | `var(--color-base-content)` | `var(--color-base-100)` |
| `emerald` | Emerald | `#10b981` | `#022c22` |
| `blue` | Blue | `#2563eb` | `#ffffff` |
| `crimson` | Crimson | `#e11d48` | `#ffffff` |
| `amber` | Amber | `#f59e0b` | `#111827` |
| `violet` | Violet | `#7c3aed` | `#ffffff` |
| `teal` | Teal | `#0d9488` | `#ffffff` |
| `orange` | Orange | `#ea580c` | `#ffffff` |

`publicAcademyThemeStyle(themeAccent: AcademyThemeAccent): CSSProperties`:

- For `default`: sets `--color-primary: var(--color-base-content)` and `--color-primary-content: var(--color-base-100)`.
- For the 7 colour swatches (`emerald`, `blue`, `crimson`, `amber`, `violet`, `teal`, `orange`): sets `--color-primary` and `--color-primary-content` to the table's hex values.

Applying these custom properties on the public Academy root container makes `btn-primary`, `radio-primary`, and `border-primary` render high-contrast monochrome in `default` mode and the selected brand colour across all 7 colour swatches.

### `app/a/[academySlug]/public-button.ts`

`PUBLIC_PRIMARY_BUTTON_CLASS`:

- Uses `--color-primary` and `--color-primary-content` so primary actions stay high-contrast monochrome (`bg-base-content text-base-100`) when `themeAccent === "default"` and use the active swatch colour for the 7 colour swatches:
  `btn bg-primary text-primary-content hover:bg-primary/90 [--btn-color:var(--color-primary)] [--btn-fg:var(--color-primary-content)]`

Used on:

- Hero CTA (`Register Now` / `Contact Us`) in `BrochureView`
- `Submit Registration` in `RegistrationForm`
- `Register another Player` in `RegistrationThankYou`

## Academy logo upload & lifecycle

### `lib/academy-assets.ts` and `app/api/academy-assets/upload/route.ts`

- Extend `AcademyAssetPurpose` with `"academy-logo"`.
- Add `"academy-logo"` to `purposes` in `app/api/academy-assets/upload/route.ts`.
- Pathname strategy in `pathnameForPurpose(academyId, purpose, extension)`:
  - `"academy-logo"` writes to `academies/${academyId}/academy-logo/${id}.${extension}` with `addRandomSuffix: true` and `allowOverwrite: false` (matching `brochure-gallery` and `coach-photos`).
  - Rationale: `/app/brochure` uploads immediately when the Owner picks a file to drive the live preview, before clicking **Save brochure**. A unique key per upload keeps unsaved editor drafts from overwriting the live production logo in Vercel Blob, ensures `next/image` and CDN caches bust when replacing a logo with the same extension, and lets `updateBrochure` delete the previous blob cleanly when `current.logoStorageKey !== nextLogoStorageKey`.
- Validation uses the existing asset limits in `lib/constants.ts`: `ALLOWED_IMAGE_MIME_TYPES` (`image/jpeg`, `image/png`, `image/webp`) and `MAX_ACADEMY_IMAGE_BYTES` (2 MB).
- Upload route calls `recordOwnerWriteIfImpersonating(context, "academy-asset.upload", { purpose })`.

## Data layer contracts

### `lib/brochure.ts`

`BrochureEditorState` adds:

- `aboutLabel: string`
- `about: string | null`
- `logoStorageKey: string | null`
- `logoUrl: string | null`
- `themeMode: AcademyThemeMode`
- `themeAccent: AcademyThemeAccent`

`getBrochureEditor(academyId)` selects `aboutLabel`, `about`, `logoStorageKey`, `themeMode`, and `themeAccent` from `academies`, normalizes `logoStorageKey` via `normalizeStoredKey`, and resolves `logoUrl` via `resolvePublicAssetUrl`.

`BrochureEditInput` adds optional fields:

- `aboutLabel?: string | null`
- `about?: string | null`
- `logoStorageKey?: string | null`
- `themeMode?: string`
- `themeAccent?: string`

`updateBrochure(academyId, input)` applies preserve-when-`undefined` semantics for partial payloads while validating every supplied field:

- `about`: when `input.about !== undefined`, trim via `optionalText(input.about)` (empty/whitespace saves as `null`). When `undefined`, keep existing column value.
- `aboutLabel`: when `input.aboutLabel !== undefined`, trim; if empty/blank, reset and save as `"About Us"`. When `undefined`, keep existing column value.
- `logoStorageKey`: when `input.logoStorageKey !== undefined`:
  - Normalize with `optionalText(input.logoStorageKey)` (`""` or `null` → `null`).
  - If non-null, validate with `isAcademyScopedStorageKey(nextLogoKey, academyId)`; on failure return `{ ok: false, error: "invalid-storage-key" }` (HTTP `403`).
  - Read `existingLogoStorageKey` before updating `academies`.
  - After updating `academies`, if `existingLogoStorageKey && existingLogoStorageKey !== nextLogoKey`, call `await deleteAcademyAsset(existingLogoStorageKey)`.
  - When `undefined`, keep existing `logoStorageKey` and do not delete from Vercel Blob.
- `themeMode`: when `input.themeMode !== undefined`, validate with `isAcademyThemeMode(input.themeMode)`; if invalid (including `null` or `""`), return `{ ok: false, error: "invalid-input" }` (HTTP `400`).
- `themeAccent`: when `input.themeAccent !== undefined`, validate with `isAcademyThemeAccent(input.themeAccent)`; if invalid (including `null` or `""`), return `{ ok: false, error: "invalid-input" }` (HTTP `400`).

### `lib/public-brochure.ts`

`PublicBrochure` adds:

- `aboutLabel: string`
- `about: string | null`
- `logoUrl: string | null`
- `themeMode: AcademyThemeMode`
- `themeAccent: AcademyThemeAccent`

`loadPublicBrochure(slug)` selects those columns from `academies` and resolves `logoUrl` via `resolvePublicAssetUrl(academy.logoStorageKey)`.

### `lib/public-conversion.ts`

`PublicConversion` adds:

- `logoUrl: string | null`
- `themeMode: AcademyThemeMode`
- `themeAccent: AcademyThemeAccent`

`loadPublicConversion(slug)` selects `logoStorageKey`, `themeMode`, and `themeAccent` from `academies`, and always resolves `logoUrl` via `resolvePublicAssetUrl(academy.logoStorageKey)` (regardless of `isIntakeAvailable`, because the header logo renders on closed/off states too).

## HTTP

### `POST /api/brochure` (`app/api/brochure/route.ts`)

- Request JSON body accepts optional `aboutLabel`, `about`, `logoStorageKey`, `themeMode`, and `themeAccent`.
- Pass each new field to `updateBrochure` only when its key is present on `body` (preserving `undefined` when omitted so existing partial callers do not clear logo, About, or appearance).
- Status codes: `not-found` → `404`, `invalid-storage-key` → `403`, `gallery-limit` → `409`, `invalid-input` / `invalid-phone` / `invalid-youtube-url` → `400`.
- On success: `recordOwnerWriteIfImpersonating(context, "brochure.update")` and `revalidatePublicAcademyPages(context.academy.slug)`.

## Screens & components

### Brochure Editor (`app/app/brochure/brochure-editor.tsx`)

Form fields in order:

1. `Academy name` (`input[name="name"]`)
2. `Academy logo`:
   - Shows logo thumbnail preview (`max-h-16 w-auto object-contain`) when `logoUrl` is present.
   - File input control (`Upload logo` when `logoStorageKey === null`, `Replace logo` when set), uploading via `POST /api/academy-assets/upload` with `purpose = "academy-logo"`.
   - `Remove logo` button when `logoStorageKey` is set (clears draft `logoStorageKey` and `logoUrl` to `null` until Save).
3. `Appearance`:
   - Mode toggle/selector (`Dark` | `Light`) controlling `themeMode`.
   - Accent colour swatch selector for the 8 options in `ACADEMY_THEME_ACCENTS` (with accessible labels and visible active state) controlling `themeAccent`.
4. `Tagline`: change label from `"Details"` to `"Tagline"` (`textarea[name="tagline"]`, `rows={3}`).
5. `About heading`: `input[name="aboutLabel"]` (default `"About Us"`).
6. `About`: `textarea[name="about"]` (`rows={6}`).
7. `Location`, `Phone`, `Gallery images`, `YouTube`, `Batch Details`, `Coach profiles`.

Live preview:

- `preview: PublicBrochure` includes `aboutLabel: aboutLabel.trim() || "About Us"`, `about: about.trim() || null`, `logoUrl`, `themeMode`, and `themeAccent`.
- The preview wrapper `<section>` applies `data-theme={preview.themeMode}` and `style={publicAcademyThemeStyle(preview.themeAccent)}` (instead of hardcoded `data-theme="dark"`).
- `save()` sends `aboutLabel`, `about`, `logoStorageKey`, `themeMode`, and `themeAccent` in the `POST /api/brochure` JSON body.

Onboarding (`/app/onboarding`) remains unchanged (`Tagline`, `Location`, `Phone` only).

### Public Brochure (`app/a/[academySlug]/page.tsx`, `brochure-view.tsx`, `brochure-header.tsx`)

- **Metadata (`page.tsx`)**: `description: brochure.tagline ?? brochure.about ?? undefined`.
- **Theme root (`page.tsx` and `brochure-view.tsx`)**: apply `data-theme={brochure.themeMode}` and `style={publicAcademyThemeStyle(brochure.themeAccent)}`.
- **Header (`BrochureHeader`)**:
  - Top-left brand mark remains non-clickable (`<span className="inline-flex items-center">`).
  - When `brochure.logoUrl` is present: render ``<Image src={brochure.logoUrl} alt={`${brochure.name} logo`} width={160} height={40} sizes="10rem" className="max-h-10 w-auto object-contain" />``.
  - When `brochure.logoUrl` is `null`: render default `restartHQ` mark (`src={brochure.themeMode === "light" ? "/logo-black.svg" : "/logo-white.svg"}`, `alt={APP_NAME}`, `width={893}`, `height={143}`, `className="h-6 w-auto"`).
- **Hamburger menu (`BrochureMenu`)**:
  - `hasAbout = Boolean(brochure.about)`.
  - `hasMenuOptions = isIntakeAvailable || Boolean(phone) || hasAbout || hasBatches || hasCoaches`.
  - Menu item order: `Register` → `Contact: {phone}` → `{aboutLabel}` (`href="#about"`, smooth scroll via `scrollToSection(event, "about")`) → `Explore Batches` (`href="#batches"`) → `Coaches` (`href="#coaches"`).
- **Hero readability (`BrochureView`)**:
  - When `brochure.images.length === 0`: omit the `<div aria-hidden="true" className="bg-neutral/65 absolute inset-0" />` scrim; hero container uses `text-base-content` (`text-base-content/85` on tagline, `text-base-content/90` on location/phone).
  - When `brochure.images.length > 0`: keep the `bg-neutral/65` scrim and apply `text-neutral-content` on the hero overlay (`text-neutral-content/85` on tagline, `text-neutral-content/90` on location/phone) so text stays readable over photos in both `dark` and `light` modes.
- **Below-hero section order (`BrochureView`)**:
  - `hasBelowHeroContent` includes `Boolean(brochure.about)`.
  - Order: `About` (`#about`) → `Videos` → `Batches` (`#batches`) → `Coaches` (`#coaches`).
  - When `brochure.about` is non-empty:
    - Render `<section id="about" className="flex scroll-mt-20 flex-col gap-4">`
    - `<h2 className="text-xl font-semibold">{brochure.aboutLabel || "About Us"}</h2>`
    - `<article className="card bg-base-200"><div className="card-body"><p className="whitespace-pre-wrap">{brochure.about}</p></div></article>`
  - When `brochure.about` is `null`/empty, omit `#about`.

### Public Conversion page (`app/a/[academySlug]/join/page.tsx`, `registration-form.tsx`, `registration-thank-you.tsx`)

- **Theme root (`join/page.tsx`)**: apply `data-theme={conversion.themeMode}` and `style={publicAcademyThemeStyle(conversion.themeAccent)}`.
- **Top header bar (`join/page.tsx`)**:
  - Rendered above `<main>` across all states (active form, thank-you, "Intake is closed.", and "Online Registration is off.").
  - `<header className="navbar bg-base-100/75 sticky top-0 z-30 h-16 px-4 backdrop-blur-md">`
  - Contains ``<Link href={`/a/${conversion.slug}`} className="inline-flex items-center">`` wrapping the Academy logo (`max-h-10 w-auto object-contain`) when `conversion.logoUrl` is set, or the default `restartHQ` mark (`/logo-black.svg` when `light`, `/logo-white.svg` when `dark`) when `null`, plus `<LinkPendingMark />`.
- **Package selection (`RegistrationForm`)**:
  - Radio input uses `radio radio-primary mt-1`.
  - Package `<label>` card uses `border-2 border-primary` when `values.batchFeeOptionId === option.id` and `border-2 border-transparent` otherwise.
- **Primary buttons**: `Submit Registration` (`RegistrationForm`) and `Register another Player` (`RegistrationThankYou`) use `PUBLIC_PRIMARY_BUTTON_CLASS`.

## Tests

### Unit & component seam tests (`lib/academy-assets.test.ts`, `lib/academy-theme.test.ts`, `app/a/[academySlug]/brochure.test.tsx`)

- `academy-logo` storage key path validation and `academy-theme` guards + CSS custom property mapping.
- `#about` section rendering, ordering (`About → Videos → Batches → Coaches`), custom `aboutLabel` vs `"About Us"` fallback, and `#about` hamburger anchor (including when `about` is the only menu item).
- Custom `logoUrl` vs `/logo-white.svg` (`dark`) and `/logo-black.svg` (`light`) on `/a/{slug}` (non-clickable) and `/a/{slug}/join` (`<Link href="/a/{slug}">`).
- `themeMode` (`dark` | `light`) and `themeAccent` styling on `BrochureView`, `BrochureEditor` preview, `ConversionPage`, `RegistrationForm` (selected package card border + `radio-primary`), and `RegistrationThankYou`, plus hero scrim and text contrast classes for 0 vs 1+ gallery images.

### HTTP / App Router flow tests (`app/api/brochure/brochure-editor-flow.test.ts`, `app/api/academy-assets/image-upload-flow.test.ts`)

- Saving `about`, `aboutLabel` (custom + blank reset to `"About Us"`), `themeMode`, and `themeAccent` via `POST /api/brochure`; rejecting invalid `themeMode`/`themeAccent` with `400 { error: "invalid-input" }`; preserving omitted fields on partial updates.
- `generateMetadata` on `/a/{slug}` using `tagline ?? about ?? undefined` for `description`.
- Uploading, replacing, and removing `academy-logo` via `POST /api/academy-assets/upload` + `POST /api/brochure`, verifying old blob cleanup via `del`, `403 invalid-storage-key` for cross-academy keys, and cache revalidation on both `/a/{slug}` and `/a/{slug}/join`.
