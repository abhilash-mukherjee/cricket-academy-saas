# Fee option term is a count of calendar days

Academies sell packages that are not whole months (45 days, 100 days). A fee option’s term is a whole number of calendar days, at least 1, with no upper cap. The same count is snapshotted on the Registration and the Enrollment. `valid_until` is the last covered day, counting `valid_from` as day one, so a 45-day term accepted on 1 June runs through 15 July. The term is shown as a day count; an Owner label may still say “Quarterly”. Days per week stays intensity (ADR 0029), not a count of Sessions. The price stays the total for the package.

**Migration.** Vercel deploys on merge, and `db:migrate` runs from a laptop after that, so a rename in the same release as the code change leaves production on the new code against `term_months` until the command finishes. The cutover is two releases. Neither gap takes the app down. Thirty days stands in for a calendar month. Neither migration rewrites `valid_until`.

The first release ships only a migration. It adds `term_days` on `batch_fee_options`, `registrations`, and `enrollments`, sets it to `term_months * 30`, and leaves `term_months` so the current app still reads. A trigger fills `term_days` from `term_months * 30` on insert. `term_months` stops being required, and fee-option uniqueness moves to `(batch_id, days_per_week, term_days)`. Merge, then migrate. The current app never reads `term_days`.

The second release’s code reads and writes `term_days` only. That deploy is safe because the column is already filled. Its migration drops `term_months` and the trigger. Run it after the deploy. The ×30 happens only in the first migration, while the stored values are still months.

The term is immutable after create, so a converted 90-day package is replaced by stopping the offer and adding a new one, not by editing the row.

**Considered options:** Keep months and put “45 days” only in the label (rejected — expiry would stay calendar months); a session pack (rejected — pause already adds calendar days back onto `valid_until`); months and days as two units (rejected — 90 days and 3 calendar months end on different dates); last covered day = `valid_from` plus the term (rejected — a 1-day term must cover `valid_from` only); show months when the count divides by 30 (rejected — 90 days is not three calendar months); cap the length (rejected — months were uncapped); leave a stored `3` as `3` days (rejected — that shrinks a live package, and the term cannot be corrected in place); one migration that renames `term_months` in the same release as the code change (rejected — fee-option queries fail from the Vercel deploy until `db:migrate` finishes).

**Consequences:** ADR 0029’s identity triple uses a day count. A pending Registration stored as 3 months becomes 90 days when the first migration runs. Multiplying again after the new code has written a real day count would turn 45 into 1350.
