# Staff auth lives in-app; email is the first factor

Owner and Coach sign in; Player and Guardian are roster records, not logins. Sessions come from an auth library in the Next.js app backed by our Postgres (not Clerk, not hand-rolled cookies). Email registration / magic link is enough for now; phone OTP waits until an Owner cannot use email. The library is Better Auth (see ADR 0011).
