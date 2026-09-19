# Public Academy pages — performance guidelines

Guidelines for making routes under `/a/…` fast. Applies to the **Brochure** and **Conversion page** as defined in `CONTEXT.md`. Architectural shape is ADR 0028; this doc is the implementation checklist.

## Scope

| Route | Domain page | Indexing | Profile |
| --- | --- | --- | --- |
| `/a/{academy-slug}` | Brochure | Yes (ADR 0019) | **Brochure profile** — aggressive HTML cache, purge on mutation |
| `/a/{academy-slug}/join` | Conversion page | No | **Conversion profile** — purge on mutation + short safety TTL |

Staff routes under `/app/…` stay `force-dynamic`; do not copy their caching model onto `/a`.

## Two passes

### Pass 1 — #38 (optimise what exists today)

Ship performance work against the **current** public surface without waiting for Batch management, Registration intake, or Super-admin deactivate. Close #38 when Pass 1 checklist items are done.

**In scope today:** Brochure and Conversion page routes, brochure/conversion save APIs, gallery/carousel/coaches/YouTube/CTA, UPI QR on conversion page, `isIntakeAvailable` as already computed in public loaders.

**Out of scope for #38** (handled in the feature ticket that introduces each mutation): purge hooks and HTTP tests for Batch open/close, online Registration toggle, fee-option changes, Super-admin deactivate/reactivate. Those tickets must follow § When shipping a feature below.

### Pass 2 — feature tickets (purge as you ship)

Any issue that adds or changes a staff mutation affecting what visitors see on `/a` must, in the **same PR**:

1. Read this doc and ADR 0028.
2. Call the shared purge helper (e.g. `revalidatePublicAcademyPages(slug)`) from the new write path.
3. Add an HTTP test that the public page reflects the change after purge.

Do not merge the feature without the purge hook — cached HTML will lie.

## Done when (#38 — Pass 1)

1. **Brochure on a phone (mid-range 4G):** LCP in the Core Web Vitals “good” band (~≤2.5s), INP not regressed by carousel or floating CTA.
2. **Brochure TTFB on a cache hit:** HTML does not wait on Neon (CDN/edge-served document).
3. **Purge on existing saves:** After Owner saves brochure or conversion/UPI QR, public HTML updates without stale marketing content or QR.

Lighthouse scores alone are not the definition of done. Prefer field-style CWV on mobile over desktop lab scores.

**Pass 2 correctness** (stale Register CTA after Batch close, cached 200 after deactivate, etc.) is verified in the feature tickets that introduce those mutations, using the invalidation table below.

## Two caching profiles

### Brochure profile

- **Policy:** Event-driven. Brochure **content slots** (name, tagline, location, phone, gallery, YouTube, Batch blurbs, Coach profiles) stay cached **until purged** — no short TTL for marketing copy. Hours or effectively indefinite between edits is expected.
- **Mechanism:** Next.js static/ISR or `unstable_cache` keyed by `academy-slug`, plus `revalidatePath` (or equivalent CDN purge) at every invalidation trigger below.
- **Do not** rely on “seconds of staleness” as the primary freshness model; staleness should only appear if a purge trigger was missed (then fix the trigger).

### Conversion profile

- **Policy:** Correctness over raw speed. Purge on the same mutation triggers that affect conversion content or intake state.
- **Safety net:** A **short time-based revalidation** (e.g. 1–5 minutes) so a missed purge self-heals. Brochure does not need this if purge coverage is complete; Conversion does.
- **Do not** cache Conversion HTML for hours without a purge path.

## Cache invalidation triggers

Call a single helper (e.g. `revalidatePublicAcademyPages(slug)`) from every write path that changes what visitors see. Purge **both** `/a/{slug}` and `/a/{slug}/join` unless the change is provably Brochure-only or Conversion-only.

| Mutation | Brochure | Conversion | Shipped in |
| --- | --- | --- | --- |
| Owner saves brochure (`POST /api/brochure`) | ✓ | ✓ | **#38** (CTA phone and `isIntakeAvailable` are baked into Brochure HTML) |
| Owner saves conversion / UPI QR (`POST /api/conversion`) | — | ✓ | **#38** |
| Owner adds or renames a Batch | ✓ | ✓ | **#45** |
| Owner toggles online Registration for the Academy | ✓ | ✓ | Feature ticket (e.g. #5) |
| Owner opens or closes a Batch for Registration | ✓ | ✓ | Feature ticket (e.g. #5) |
| Batch fee options added, removed, or reordered | ✓ | ✓ | **#46** |
| Super-admin deactivates or reactivates Academy | ✓ | ✓ | Feature ticket (e.g. #8); deactivated → 404; refresh sitemap |
| Brochure gallery / Coach image upload replacing saved keys | ✓ | — | **#38** (via brochure save after upload) |
| New active Academy (onboarding) | — | — | Sitemap only (`listActiveBrochureUrls`) |

When adding a new staff mutation that touches `academies`, `batches`, `batch_fee_options`, brochure assets, or intake flags, add a purge call in the same PR or the page will lie.

## When shipping a feature that touches `/a`

Use this checklist in any feature PR (Batch management, Registration intake, Super-admin deactivate, etc.):

- [ ] Read ADR 0028 and this doc before implementing the staff mutation.
- [ ] Identify which rows in the invalidation table your mutation affects.
- [ ] Call `revalidatePublicAcademyPages(slug)` (or equivalent) from the write path on success.
- [ ] Add an HTTP test: mutate → `GET /a/{slug}` (and `/join` if applicable) reflects the change.
- [ ] Do not add `force-dynamic`, session reads, or client-side intake polling on `/a` routes.

Agents implementing a child of #1 should treat the **Shipped in** column as part of the ticket's acceptance criteria when the feature changes public page output.

## Data fetching (server)

Current baseline: `getPublicBrochure` / `getPublicConversion` query Neon on every request; Brochure runs the loader twice per request (`generateMetadata` + page).

- **Deduplicate** per-request loads (`React.cache` on the public loaders, or one metadata+page fetch pattern).
- **Keep loaders in `lib/`** (`public-brochure.ts`, `public-conversion.ts`); routes stay thin.
- **Do not** read cookies or session on `/a` — keeps pages publicly cacheable.
- **`isAcademyIntakeAvailable`** stays in the loader; do not split intake into client-side fetch unless ADR 0028 is reopened.

## Images (Vercel Blob, ADR 0027)

Blob host is already allowlisted in `next.config.ts` (`*.public.blob.vercel-storage.com/academies/**`).

- Use **`next/image` for all `/a` photos**: gallery (including single-image case), Coach profiles, UPI QR on the Conversion page. Remove raw `<img>` inconsistencies in `brochure-view.tsx` and `join/page.tsx`.
- **LCP:** First gallery slide gets `priority`; others lazy-load. Set accurate `sizes` for mobile-first layout (ADR 0023).
- **Coach thumbnails:** Fixed dimensions with `sizes` matching rendered size (~8rem).
- **Follow-up if CWV still misses:** resize or transcode at upload time in `app/api/academy-assets/upload` (WebP, max width) so `<img>` or optimizer does less work per request — optional second phase, not a blocker for `next/image` unification.

Respect `MAX_ACADEMY_IMAGE_BYTES`, `ALLOWED_IMAGE_MIME_TYPES`, and `MAX_BROCHURE_GALLERY_IMAGES` from `lib/constants.ts`.

## Third parties

### YouTube (Brochure only)

- **Do not** render eager `youtube.com` iframes in the initial HTML.
- Use a **lazy facade**: poster (YouTube thumbnail or neutral placeholder) + play control; inject iframe only after tap. Preserves the slot without paying YouTube cost on first paint.

### Fonts and analytics

- Root layout loads Geist via `next/font` — keep it; no extra font families on `/a`.
- **No analytics or chat widgets** on Brochure or Conversion pages unless a future ADR adds them. They fight the mobile CWV target.

## Client JavaScript

Keep client boundaries minimal; Brochure already uses client code for carousel and floating CTA.

- **Carousel (`brochure-gallery.tsx`):** Acceptable for multi-image galleries; ensure first slide is server-rendered with `next/image` + `priority`. Avoid shipping carousel JS when `images.length === 1` (already handled by branching in `brochure-view.tsx`).
- **Floating CTA (`brochure-cta.tsx`):** Clipboard API is fine; do not add polling or client fetch for intake state — intake comes from cached server HTML + purge triggers.
- **Preview in `/app/brochure`:** Reuses `BrochureView`; optimisations there benefit both preview and public page.

## SEO and caching (Brochure only)

- Keep `generateMetadata` title/description/canonical (ADR 0019).
- After caching work, verify deactivated Academies are not served as 200 from cache and remain excluded from `app/sitemap.ts` (when deactivate ships — feature ticket + purge hook).
- Conversion page stays `robots: noindex` — do not widen indexing for perf.

## Anti-patterns

- `force-dynamic` or per-request `cookies()` / `headers()` on `/a` routes.
- Long TTL on Conversion HTML without purge hooks.
- Purging only on brochure save while Batch or Registration toggles skip purge (stale Register CTA).
- Raw `<img>` to Blob URLs “to skip the optimizer” without measuring LCP.
- Eager YouTube embeds on mobile landing traffic.
- Sharing one cache TTL policy across Brochure and Conversion.
- Shipping a staff mutation that changes public output without a purge call in the same PR.

## #38 checklist (Pass 1 — optimise existing surface)

Close #38 when every item is done and § Done when (#38 — Pass 1) is met.

### Cache and invalidation (existing write paths)

- [ ] Brochure route uses Brochure profile (event-driven HTML cache keyed by slug).
- [ ] Conversion route uses Conversion profile (purge on mutation + short safety TTL).
- [ ] Shared purge helper wired to **brochure save** and **conversion/UPI save** (rows marked **#38** in invalidation table).
- [ ] HTTP test: save brochure → public Brochure HTML reflects change after purge.
- [ ] HTTP test: save conversion/UPI QR → public Conversion page reflects change after purge.
- [ ] `React.cache` (or equivalent) dedupes `getPublicBrochure` / `getPublicConversion` within one request (metadata + page).

### Brochure media and third parties

- [ ] Gallery, single image, and Coach photos use `next/image` with correct `sizes` / `priority`.
- [ ] YouTube slot uses lazy facade, not eager iframe.
- [ ] Mobile CWV check on a representative Brochure (gallery + video + CTA).

### Conversion page (existing surface)

- [ ] UPI QR uses `next/image` when shown on Conversion page today.
- [ ] Conversion safety TTL documented in code (`revalidate` export or cache config).

### Client JS

- [ ] Carousel bundle not loaded for single-image Brochures.
- [ ] No client-side intake polling added.

### Verification

- [ ] Cache hit: Brochure TTFB without Neon on repeat visit (staging or production).
- [ ] Document before/after CWV or lab mobile metrics in the issue comment when closing.

## References

- `CONTEXT.md` — Brochure, Conversion page, Registration, Batch
- ADR 0010, 0019, 0020, 0021, 0023, 0027, 0028
- `lib/public-brochure.ts`, `lib/public-conversion.ts`, `lib/academy-intake.ts`
- `app/a/[academySlug]/`, `app/a/[academySlug]/join/`
