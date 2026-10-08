# Signed-in visitors skip the product homepage

A request to `/` with a staff session cookie (Owner, Coach, or Super-admin) redirects to `/app` before the marketing page renders. Anonymous `/` stays a public, cacheable document: we do not look up a Better Auth session or hit Neon to decide. Cookie presence is enough; `/app` still validates the session. An expired cookie may bounce `/` → `/app` → `/login`. `/login` and Academy brochure/conversion URLs are unchanged.

**Considered options:** Load the session in the product homepage and redirect (rejected — every visitor would wait on Postgres, including people who have never signed in); always show the marketing page to signed-in staff (rejected — they already have `/app`).
