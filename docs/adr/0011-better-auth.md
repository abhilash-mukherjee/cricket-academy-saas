# Better Auth for Owner and Coach sessions

Staff sign-in is Better Auth in the Next.js app, backed by our Postgres, with email as the first factor. Clerk would own identity we already decided to keep; Auth.js is the older App Router-awkward alternative. Player and Guardian remain tables, not Better Auth users.
