# Dedicated dev, staging, and production environments

We run three long-lived Vercel custom environments, each with its own Neon database and env vars, on one Vercel project (not three projects). `dev` tracks git `dev`, `staging` tracks git `staging`, `main` is production. Feature work is `feat/`/`fix/` off `dev`; Preview deploys of those branches use the **dev** Neon, not a fourth database. Promote with PRs: `dev` → `staging` → `main`. Tags on `main` remain the release names (`v1.0.1`), not `Release-v*` branches.

Standing `dev` is an integration environment: it must stay mergeable, and we migrate Drizzle to all three databases. Free Neon forces scale-to-zero on every compute (ADR 0025); when latency or compute-limits become an issue, and we upgrate to Launch plan, disable it on staging and production and let `dev` still scale to zero. Do not copy production Player/Guardian data into lower environments.
