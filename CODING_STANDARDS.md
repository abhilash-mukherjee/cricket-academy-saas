# Coding Standards

Agent contract for implementing and reviewing code in this repo. When these rules conflict with an explicit human instruction, follow the human.

## Rules

1. **Single source of truth.** Do not restate `CONTEXT.md`, ADRs, or lint/format/typecheck config. Point there. Put here only conventions those sources do not encode.

2. **Tooling wins.** When ESLint, Prettier, `tsc`, or test runners exist, their config is authoritative. On disagreement, fix the tool — not this file.

3. **Grow slowly.** Add a rule only after the same mistake survives a code fix and tooling. Replace an existing rule to stay near eight; do not append by default.

4. **Domain language.** Names in code, tests, and issues use the vocabulary in `CONTEXT.md` (Academy, Registration, Player, Batch, Session, Owner, Coach). Do not introduce synonyms the glossary avoids.

5. **Tenant isolation.** Academy-scoped reads and writes go only through data-layer modules that require `academyId`. No ad-hoc Drizzle in route handlers or components. Resolve `academyId` from auth or session context — never from unvalidated client input alone. See ADR-0008.

6. **Deep modules.** Shape code with the `codebase-design` skill: behaviour behind small interfaces at clean seams. Do not restate that skill here.

7. **Tests on critical paths.** Auth, tenant isolation, and money-adjacent flows (Registration inbox, roster changes) ship with at least one test at a named seam. Other behaviour: test when the change is risky or when `/tdd` is invoked.

8. **Layout.** `app/` for routes and UI; `lib/` for shared non-UI code; `db/` or `lib/db/` for schema and queries. No feature folders until the same layout pain repeats.
