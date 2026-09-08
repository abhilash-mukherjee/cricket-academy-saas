# Secrets live in Vercel env and gitignored local files

`DATABASE_URL`, the unpooled migrate URL, Better Auth secret, and Resend key live in Vercel project env (production and preview) and a gitignored local `.env`. Neon holds the database URLs in its dashboard. A secrets manager is ceremony for one person. Chat and docs are not a secret store.
