# Owner chooses Enrollment valid-from

The Owner sets valid-from when accepting a Registration or adding a Player manually. The date is today or earlier on the Asia/Kolkata calendar, the same clock as Player age. valid-until is the last covered day of the term and must be today or later, so the new Enrollment is Active. A future start, and a term that is already over, are rejected. The package on accept is the Registration’s snapshot; manual add copies days per week, term days, and fee from a fee option on that Batch, including one that is no longer offered. A separate renew action is not part of this phase (ADR-0040).

**Considered options:** Always today (rejected — offline Players and a late accept start on a day the Owner names); any past or future date (rejected — a term that has not started needs a fourth status, and recording an already-finished term is a different job).
