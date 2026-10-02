# Fee option is intensity × tenure, not tenure alone

A Batch is one standing group; days-per-week is a second commercial axis on the fee option, not a reason to split Batches or to store a timetable of weekdays. Identity is `(batch, days_per_week, term days)` — uniqueness is that triple, not the term alone (ADR 0033; this file originally said `term_months`) — with an optional Owner label for display only. Registration and Enrollment snapshot days-per-week, term, and fee (not the label); intensity is not an attendance cap, matching v1’s unenforced `valid_until`.

Once a Registration references a fee option, hide it (not offered) rather than delete; days-per-week and term length do not change after create. Legal `days_per_week` is 1–7. Packages are sparse: the Owner adds only what they sell.

**Considered options:** Split “Adult 2-day” / “Adult 3-day” into separate Batches (rejected — same group, same Sessions); named weekday schedules on the package (rejected — a later concept); label as the only distinction (rejected — cannot unique or snapshot a count); enforce Session caps from days-per-week (rejected — same posture as unenforced expiry); delete referenced options or mutate identity in place (rejected — history and uniqueness both break).
