# Cricket Academy SaaS

Software for cricket academies. Each academy is a tenant; most behaviour runs in the context of one academy.

## Language

**Academy**:
A cricket coaching business that is a tenant of the product. Almost all features run in the context of one Academy.
_Avoid_: Tenant (in user-facing language), organisation, club

**Registration**:
Details submitted on an Academy's conversion page (not the brochure). The visitor chooses a Batch. The product does not verify that UPI payment happened. A Registration is not a Player.
_Avoid_: Enrollment, membership, payment

**Guardian**:
The adult contact for a Player. Required when the Player is a minor; optional when the Player is an adult. Guardians do not have accounts in this phase. The phone you actually use is the Guardian's when one is present.
_Avoid_: Parent, customer (the Academy owner is the customer)

**Player**:
A person on an Academy roster after staff accept a Registration and place them on a Batch. A Player can belong to more than one Batch at a time.
_Avoid_: Student, kid, member, registration

**Batch**:
A standing group of Players at an Academy (for example U-14 evening). Players belong to a Batch; one Player may belong to several.
_Avoid_: Session, class, group

**Session**:
One occurrence of a Batch. Attendance is marked on a Session, not on a Batch.
_Avoid_: Batch, class, practice

**Owner**:
The logged-in user who subscribes and administers an Academy: brochure, conversion page, Registration inbox, and roster. The same user can also be a Coach.
_Avoid_: Admin, manager

**Coach**:
A logged-in user who marks Session attendance for an Academy. The same user can also be the Owner. Parents and Guardians do not have accounts in this phase.
_Avoid_: Trainer, teacher
