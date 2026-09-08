# Dedicated dev, staging, and production environments

We run three long-lived Vercel custom environments, each with its own Neon database and env vars, on one Vercel project (not three projects). `dev` tracks git `dev`, `staging` tracks git `staging`, `main` is production. Feature work is `feat/`/`fix/` off `dev`; Preview deploys of those branches use the **dev** Neon, not a fourth database. Promote with PRs: `dev` → `staging` → `main`. Tags on `main` remain the release names (`v1.0.1`), not `Release-v*` branches.

Standing `dev` is an integration environment: it must stay mergeable, and we migrate Drizzle to all three databases. Disable Neon scale-to-zero on staging and production; `dev` may still scale to zero to save money. Do not copy production Player/Guardian data into lower environments.
