import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";

describe("v1 domain schema exports", () => {
  it("re-exports auth and domain tables from schema.ts", () => {
    expect(schema.user).toBeDefined();
    expect(schema.academies).toBeDefined();
    expect(schema.registrations).toBeDefined();
    expect(schema.enrollments).toBeDefined();
    expect(schema.registrationStatusEnum).toBeDefined();
  });
});

describe("v1 domain migration", () => {
  const migrationPath = join(
    import.meta.dirname,
    "migrations",
    "0001_v1_domain_schema.sql",
  );

  it("drops schema_bootstrap and adds required constraints", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/DROP TABLE.*schema_bootstrap/i);
    expect(sql).toMatch(/CREATE TYPE.*registration_status/i);
    expect(sql).toMatch(/academies_slug_format/i);
    expect(sql).toMatch(/academies_owner_user_id_unique/i);
    expect(sql).toMatch(/registrations_pending_duplicate_guard/i);
    expect(sql).toMatch(/WHERE.*status.*pending/i);
  });
});
