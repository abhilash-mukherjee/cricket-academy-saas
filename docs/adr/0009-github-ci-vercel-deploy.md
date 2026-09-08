# GitHub holds the repo; Vercel deploys; Actions only checks

The remote will be GitHub. Vercel deploys from git (production and previews). GitHub Actions run typecheck and tests on push and must not deploy: a second deploy path duplicates Vercel and hides failures in two dashboards.
