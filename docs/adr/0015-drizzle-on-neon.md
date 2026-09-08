# Drizzle talks to Neon over HTTP

The query layer is Drizzle, not Prisma. Neon + Vercel serverless is the reason: `drizzle-orm/neon-http` is the path that does not need Prisma’s driver adapter and split pooled/direct URLs for app traffic. Schema lives in TypeScript; migrations come from drizzle-kit. Nested Prisma-style writes are not a goal — joins and transactions are. Operator familiarity with Prisma was a real cost; we accepted it to avoid fighting the host.
