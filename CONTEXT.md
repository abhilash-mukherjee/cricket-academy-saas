# Cricket Academy SaaS

Software for cricket academies. Each academy is a tenant; most behaviour runs in the context of one academy.

## Language

**Academy**:
A cricket coaching business that is a tenant of the product. Almost all features run in the context of one Academy. An Owner creates their Academy during first-time onboarding (name and slug), or a Super-admin creates one and assigns an Owner email to claim. Public pages use an `academy-slug` picked at creation (lowercase letters, numbers, and hyphens; unique across the product; immutable). An unknown or deactivated slug returns not found. A deactivated Academy locks the Owner out of `/app/…` until a Super-admin reactivates it. An Owner can turn off online Registration for the Academy; when off, the brochure shows a contact CTA instead of a link to the conversion page.
_Avoid_: Tenant (in user-facing language), organisation, club

**Brochure**:
An Academy's public marketing page at `/a/{academy-slug}` on a fixed template, indexed by search engines. The Owner edits Academy name, tagline, location, phone, Batch blurbs for all Batches (names and short copy only — not selectable, regardless of whether the Batch is open for Registration), uploaded images, embedded YouTube links, and Coach profiles (name and optional uploaded photo). When online Registration is on, the CTA links to the conversion page. When online Registration is off, the CTA shows the Academy phone; tapping it copies the number. Visitors do not submit a Registration here.
_Avoid_: Landing page, website, homepage

**Conversion page**:
An Academy's public intake page at `/a/{academy-slug}/join` where a visitor submits a Registration, chooses one open Batch and a fee option (term and total price), and sees the Academy's UPI QR (an image the Owner uploaded) and the selected fee. Unavailable when online Registration is off for the Academy, when no Batch is open for Registration, when a Batch has no fee options, or when the Academy is deactivated — in those cases the page explains why and does not show a form. After submit, the visitor sees a thank-you screen only (no account, no status link).
_Avoid_: Sign-up page, join form

**Registration**:
Details submitted on an Academy's conversion page (not the brochure). One Registration is one intended Player for exactly one Batch and one fee option: Player full name, date of birth, Batch, and term/fee; Guardian full name and phone when the Player is under 18; Player phone when the Player is an adult; optional note. A second submit is blocked while a pending Registration already exists for the same phone, Batch, and Player name (case-insensitive, trimmed), regardless of fee option. The Owner accepts or rejects pending Registrations in the inbox; rejected Registrations may be submitted again. On accept, the Owner links to an existing Player with the same name and phone at the Academy or creates a new Player and creates an Enrollment for the Batch and term. The product does not verify that UPI payment happened. A Registration is not a Player and not an Enrollment.
_Avoid_: Membership, payment

**Enrollment**:
A Player's placement on a Batch for a defined term, created when the Owner accepts a Registration. Carries the term length, fee paid, and valid-from / valid-until dates. Renewals add a new Enrollment linked to the prior one. The first vertical captures Enrollment dates but does not enforce expiry or run renewal workflows. An Enrollment is not a Registration.
_Avoid_: Subscription, membership

**Guardian**:
The adult contact for a Player. Required when the Player is under 18; optional when the Player is an adult. Guardians do not have accounts in this phase. The phone you actually use is the Guardian's when one is present.
_Avoid_: Parent, customer (the Academy owner is the customer)

**Player**:
A person on an Academy roster after the Owner accepts a Registration. A Player can have Enrollments on more than one Batch at a time.
_Avoid_: Student, kid, member, registration

**Batch**:
A standing group of Players at an Academy (for example U-14 evening). Each Batch has one or more fee options (term length and total price in INR). Players are placed on a Batch through Enrollments; one Player may have Enrollments on several Batches, or multiple Enrollments on the same Batch over time (renewals). New Batches start closed for Registration; an Owner opens a Batch when ready and adds fee options before intake. Only open Batches with at least one fee option appear on the conversion page. Fees are shown on the conversion page, not the brochure.
_Avoid_: Session, class, group

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
