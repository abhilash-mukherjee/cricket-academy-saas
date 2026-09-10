# neon-http until a write needs a session

App traffic uses `drizzle-orm/neon-http` because Vercel functions are one-shot: HTTP is the cheaper path and does not need a held WebSocket pool. Switch to `drizzle-orm/neon-serverless` (WebSocket `Pool`) when a write must read, then decide, then write in one commit — HTTP cannot hold that session.
