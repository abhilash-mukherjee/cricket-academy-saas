# V1 domain schema for issue #1 vertical

The first vertical's Postgres tables are specified in `docs/schema/issue-1-vertical.md`. This ADR records the non-obvious trade-offs that shaped that design.

**No `guardians` table in v1.** Guardian contact fields live inline on `registrations`; durable roster identity is `players` only. A separate Guardian entity can be added later if roster contacts need to outlive a single Registration.

**Stored `contact_phone` on registrations.** The duplicate-pending guard is a partial unique index on `(academy_id, batch_id, contact_phone, player_full_name_normalized) WHERE status = 'pending'`. `contact_phone` is the phone actually used (Guardian phone when present, else Player phone) so the index stays simple and matches `CONTEXT.md`. Fee option is not part of the duplicate key — one pending intake per Player per Batch.

**`enrollments`, not `player_batches`.** A Player’s placement on a Batch for a term is an Enrollment (created on accept). A Player may have multiple Enrollments on the same Batch over time (renewal history). `renewed_from_enrollment_id` links renewal periods. “Player belongs to more than one Batch” means active or historical Enrollments across Batches.

**`batch_fee_options`, not `batches.fee_paise`.** Each Batch offers discrete packages (term length × days per week × total price). `fee_paise` is the total for that package, not a monthly rate — academies often discount longer commitments. The visitor picks an option at registration; intensity, term, and fee are snapshotted on the Registration (ADR-0029). A Batch with no offered fee options is not registrable.

**`storage_key`, not public URLs.** UPI QR, brochure images, and coach photos store an object-storage key; the app resolves URLs. CDN or provider base URL changes do not orphan rows. The Academy UPI QR is one image; the amount shown comes from the visitor’s selected fee option.

**Impersonation state is session-only.** Active impersonation (banner, exit) lives in the session; `impersonation_audit_events` records meaningful writes (ADR-0018). No `impersonation_sessions` table in v1.

**Drop `schema_bootstrap`.** The marker table proved migrate plumbing; the first domain migration replaces it. Health checks can query domain tables or run a simple DB ping.

**Enrollment dates captured in #1; expiry not enforced.** `valid_from` / `valid_until` are written on accept but renewal workflows and “lapsed” UI are post-#1.

**Considered options:** JSON columns for brochure media (rejected — ordered lists and CRUD are cleaner as child tables); inferring Owner role from a `role` column on `user` (rejected — `is_super_admin` plus `academies.owner_user_id` is enough for the one-Academy-per-login rule); monthly rate × term on `batches` (rejected — package pricing is more flexible).

Full table and column spec: `docs/schema/issue-1-vertical.md`.
