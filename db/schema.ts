import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Marker table only — proves migrate plumbing. No Academy or Registration schema. */
export const schemaBootstrap = pgTable("schema_bootstrap", {
  id: text("id").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
