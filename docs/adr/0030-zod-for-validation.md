# New feature input is validated with Zod

Request bodies, form fields, and other newly added input that needs a contract are validated with Zod — one schema, typed, shared on the server and reused on the client when the UI needs the same rules. Hand-rolled `if` checks and a second library (Yup, Valibot) would split dialects; Zod is already in the install graph as a transitive dependency, so new work makes it direct and uses it. Existing routes keep their current checks until that surface is rewritten; this is not a big-bang migration.

**Considered options:** Keep ad-hoc `invalid-input` branches for all new APIs (rejected — Registration already needs shared client/server rules, and a second style would stick); Yup or Valibot (rejected — extra library for the same job).
