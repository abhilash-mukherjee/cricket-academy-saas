# Cricket Academy SaaS

Software for cricket academies. Almost all features run in the context of one Academy.

## Local development

Copy `.env.example` to `.env` and fill the Neon `dev` URLs from the Neon dashboard (pooled `DATABASE_URL` for the app, unpooled `DATABASE_URL_UNPOOLED` for migrate). Local work uses Neon `dev`, not a local Postgres.

```bash
npm install
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The bootstrap page shows the deployment target (`local` on a laptop) and whether the bootstrap marker table is reachable.

## Migrate from a laptop

Do not run migrations in GitHub Actions or during a Vercel build. After a PR merges to a long-lived branch, migrate that branch's Neon database from your machine with the matching **unpooled** URL.

Install dependencies once (`npm install`). drizzle-kit reads `DATABASE_URL_UNPOOLED` from `.env`.

### After merge to `dev` (Neon `dev`)

`.env` already points `DATABASE_URL_UNPOOLED` at Neon `dev`:

```bash
npm run db:migrate
```

### After merge to `staging` (Neon `staging`)

```bash
DATABASE_URL_UNPOOLED="$STAGING_DATABASE_URL_UNPOOLED" npm run db:migrate
```

### After merge to `main` (Neon `production`)

```bash
DATABASE_URL_UNPOOLED="$PRODUCTION_DATABASE_URL_UNPOOLED" npm run db:migrate
```

Confirm the `schema_bootstrap` table exists on that Neon branch before treating the environment as current.

## CI

GitHub Actions runs typecheck, lint, and unit tests on pull requests. It does not deploy and does not use Neon credentials.
