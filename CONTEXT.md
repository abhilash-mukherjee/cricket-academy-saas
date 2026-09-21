# Cricket Academy SaaS

Software for cricket academies. Each academy is a tenant; most behaviour runs in the context of one academy.

## Language

**Academy**:
A cricket coaching business that is a tenant of the product. Almost all features run in the context of one Academy. An Owner creates their Academy during first-time onboarding (name and slug), or a Super-admin creates one and assigns an Owner email to claim. Public pages use an `academy-slug` picked at creation (lowercase letters, numbers, and hyphens; unique across the product; immutable). An unknown or deactivated slug returns not found. A deactivated Academy locks the Owner out of `/app/…` until a Super-admin reactivates it. An Owner can turn off online Registration for the Academy, which makes the conversion page unavailable.
_Avoid_: Tenant (in user-facing language), organisation, club

**Brochure**:
An Academy's public marketing page at `/a/{academy-slug}` on a fixed template, indexed by search engines. The Owner edits Academy name, tagline, location (plain text or a link, shown with a location icon), phone, Batch blurbs for all Batches (names and short copy only — not selectable, regardless of whether the Batch is open for Registration), uploaded images, embedded YouTube links, and Coach profiles (name and optional uploaded photo). Phone, when set, is shown on the brochure. The floating CTA links to the conversion page when a visitor can submit a Registration there; otherwise it copies the Academy phone if one is set, and is omitted if there is no phone. Visitors do not submit a Registration here.
_Avoid_: Landing page, website, homepage

**Conversion page**:
An Academy's public intake page at `/a/{academy-slug}/join` where a visitor submits a Registration and chooses one registrable Batch and a fee option. Layout order is the same on every viewport: packages, then Player details, then pay. The UPI QR (if the Owner uploaded one) and the selected fee appear only after a fee option is chosen and required name, date of birth, and phone are valid — not in a laptop rail and not before that step. Unavailable when online Registration is off (explains, no form; Academy phone when set) or when no Batch is registrable (intake is closed, no form, link to the brochure). A deactivated slug returns not found, same as the brochure. After submit, the visitor sees a thank-you screen only (no account, no status link).
_Avoid_: Sign-up page, join form

**Registration**:
Details submitted on an Academy's conversion page (not the brochure). One Registration is one intended Player for exactly one Batch and one fee option: Player full name, date of birth, Batch, and fee option; Guardian full name and phone when the Player is under 18; Player phone when the Player is an adult; optional contact email; optional note. Adult Guardian is not collected at intake. Contact email is not a login and is not copied onto the Player in this phase; the product does not send mail to it. A second submit is blocked while a pending Registration already exists for the same phone, Batch, and Player name (case-insensitive, trimmed), regardless of fee option or email — that phone is the Guardian's when the Player is under 18, otherwise the Player's. The Owner accepts or rejects pending Registrations in the inbox; rejected Registrations may be submitted again. On accept, the Owner links to an existing Player with the same name and phone at the Academy or creates a new Player and creates an Enrollment for that Batch and fee option. The product does not verify that UPI payment happened. A Registration is not a Player and not an Enrollment.
_Avoid_: Membership, payment

**Enrollment**:
A Player's placement on a Batch for a defined term, created when the Owner accepts a Registration. Carries the days per week, term length, fee paid, and valid-from / valid-until dates as they stood at Registration — not a live link to the fee option. Renewals add a new Enrollment linked to the prior one. The first vertical records those facts but does not enforce expiry, attendance caps, or renewal workflows. An Enrollment is not a Registration.
_Avoid_: Subscription, membership

**Guardian**:
The adult contact for a Player under 18. Full name and phone are required on the Conversion page when the Player is under 18, and are not collected when the Player is 18 or older. Guardians do not have accounts in this phase. The phone on a Registration is the Guardian's when the Player is under 18, otherwise the Player's.
_Avoid_: Parent, customer (the Academy owner is the customer)

**Phone**:
A contact number for an Academy, a Guardian, or a Player. The same number written in different local or international forms is one Phone — that is how pending Registrations and Players are matched. Numbers without a country prefix are Indian; numbers that already name another country are accepted. The product shows the canonical Phone, not the original typing.
_Avoid_: mobile (when we mean any Phone), cell

**Player**:
A person on an Academy roster after the Owner accepts a Registration. A Player can have Enrollments on more than one Batch at a time.
_Avoid_: Student, kid, member, registration

**Batch**:
A standing group of Players at an Academy (for example U-14 evening). Players are placed on a Batch through Enrollments; one Player may have Enrollments on several Batches, or multiple Enrollments on the same Batch over time (renewals). Names are unique at an Academy (case-insensitive, trimmed); public pages show the name as typed. New Batches start closed for Registration; an Owner can open a Batch only when it has at least one offered fee option. A Batch is registrable when it is open for Registration and has at least one offered fee option; only registrable Batches appear on the conversion page.
_Avoid_: Session, class, group

**Fee option**:
A sellable package on a Batch: days per week the package covers (a count from 1 to 7, not named weekdays), term length as a positive number of months, and a positive total price in INR. Identity is that days-per-week and term pair; an optional Owner label is display wording only. The Owner creates only the packages they sell — no generated grid — and may stop offering a package and offer the same package again later, or delete one that no Registration has used. Days per week and term do not change after create. A Batch is registrable only with at least one offered fee option. Days per week is what was paid for, not a Session attendance cap. On the conversion page the count, term, and price are always shown; a label, if set, is the name above those facts. Fees are shown on the conversion page, not the brochure.
_Avoid_: Subscription, plan, pricing tier, timetable, archived fee

**Session**:
One occurrence of a Batch. Attendance is marked on a Session, not on a Batch.
_Avoid_: Batch, class, practice

**Owner**:
The logged-in user who runs an Academy: brochure, conversion page, Registration inbox (accept and reject), and roster. Signs up from the product homepage via email magic link (or claims an Academy a Super-admin assigned); provides a display name during onboarding. One login owns one Academy in this phase. Staff screens live under `/app/…`. The same user can also be a Coach. SaaS billing is not part of the first slice.
_Avoid_: Admin, manager

**Super-admin**:
A platform operator with cross-Academy access at `/app/admin/…`. Provisioned out of band (seeded email, magic-link sign-in) — not self-registration. Does not belong to any Academy as Owner or Coach. Can list Academies, open public links, create an Academy and assign an Owner email to claim, deactivate and reactivate an Academy, and impersonate an Owner with full access (persistent banner, exit control, actions logged).
_Avoid_: Admin (in Owner-facing language), root user

**Coach**:
A logged-in user who marks Session attendance for an Academy. The same user can also be the Owner. An Owner may add display-only Coach profiles on the brochure (name, image, optional blurb); these may or may not match a logged-in Coach. Parents and Guardians do not have accounts in this phase.
_Avoid_: Trainer, teacher
