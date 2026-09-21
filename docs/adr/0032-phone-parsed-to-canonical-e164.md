# Phone input is parsed; stored and shown as canonical E.164

Visitors and Owners type local or messy numbers (10-digit Indian mobile, `91` without `+`, spaces, dashes, trunk `0`). Phone is an identity key — pending Registration duplicates and Player uniqueness — so every field (Academy, Guardian, Player) goes through one parser: default region India, explicit other-country numbers kept, landlines allowed, extensions rejected. We persist E.164 and show that canonical value on the brochure, thank-you, `tel:` links, and copy-to-call. That is a deliberate exception to ADR 0020’s “slot text is shown as typed.” The form box stays as typed until save. Empty Academy phone stays empty. UI copy is “Enter a valid phone number,” not a demand for E.164.

**Lenient validity.** A plausible E.164 is enough; we do not check whether the prefix is allocated. Too short, letters, or an extension fail.

**Considered options:** Require typed E.164 (rejected — unnecessary errors on the conversion page); India-mobile-only (rejected — Academy landlines); store as-typed plus a normalized column (rejected — two values for one identity); numbering-plan `isValid` checks (rejected — new ranges fail until metadata updates); rewrite the field on blur (rejected — jumpy on a phone keypad).

**Consequences:** `9876543210` and `+919876543210` are the same Phone. Existing rows are already E.164; no backfill.
