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

describe("fee option term cutover", () => {
  const migrationsDir = join(import.meta.dirname, "migrations");
  const first = readFileSync(
    join(migrationsDir, "0005_fee_option_term_days.sql"),
    "utf8",
  );
  const second = readFileSync(
    join(migrationsDir, "0006_drop_term_months.sql"),
    "utf8",
  );

  it("converts stored months to days once, keeps months readable, and does not rewrite valid-until", () => {
    expect(first).toContain('"term_days" = "term_months" * 30');
    expect(first).toContain("IF NEW.term_days IS NULL THEN");
    expect(first).toContain("NEW.term_days := NEW.term_months * 30");
    expect(first).toContain('ALTER COLUMN "term_months" DROP NOT NULL');
    expect(first).toContain(
      'UNIQUE("batch_id","days_per_week","term_days")',
    );
    expect(first).not.toMatch(/valid_until/i);
    expect(first).not.toMatch(/drop column "term_months"/i);
  });

  it("drops months and the fill trigger without converting again or rewriting valid-until", () => {
    expect(second).toContain('DROP COLUMN "term_months"');
    expect(second).toContain('DROP FUNCTION "fill_term_days_from_term_months"');
    expect(second).not.toMatch(/\* 30/);
    expect(second).not.toMatch(/valid_until/i);
  });
});

describe("operations schema for guardian, pause, and batch sessions", () => {
  const migrationPath = join(
    import.meta.dirname,
    "migrations",
    "0007_player_guardian_enrollment_pause_batch_sessions.sql",
  );

  it("adds guardian, optional enrollment provenance, pause rows, and batch session attendance without touching registrations", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain(
      'ALTER TABLE "players" ADD COLUMN "guardian_full_name" text;',
    );
    expect(sql).toContain(
      'ALTER TABLE "players" ADD COLUMN "guardian_phone" text;',
    );
    expect(sql).toContain(
      'ALTER TABLE "enrollments" ALTER COLUMN "registration_id" DROP NOT NULL;',
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "enrollments_registration_id_unique" ON "enrollments" USING btree \("registration_id"\) WHERE "enrollments"\."registration_id" is not null/,
    );

    expect(sql).toContain('CREATE TABLE "enrollment_pauses"');
    expect(sql).toMatch(
      /"planned_last_paused_on" is null or "enrollment_pauses"\."planned_last_paused_on" >= "enrollment_pauses"\."paused_on"/,
    );
    expect(sql).toMatch(
      /"resumed_on" is null or "enrollment_pauses"\."resumed_on" >= "enrollment_pauses"\."paused_on"/,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "enrollment_pauses_one_open_per_enrollment" ON "enrollment_pauses" USING btree \("enrollment_id"\) WHERE "enrollment_pauses"\."resumed_on" is null/,
    );

    expect(sql).toMatch(
      /CREATE TYPE "public"\."batch_session_attendance_mark" AS ENUM\('present', 'absent'\)/,
    );
    expect(sql).toContain('CREATE TABLE "batch_sessions"');
    expect(sql).toContain(
      'CONSTRAINT "batch_sessions_academy_id_batch_id_session_date_unique" UNIQUE("academy_id","batch_id","session_date")',
    );
    expect(sql).toContain('CREATE TABLE "batch_session_attendance"');
    expect(sql).toContain(
      '"mark" "batch_session_attendance_mark" NOT NULL',
    );
    expect(sql).toContain(
      'CONSTRAINT "batch_session_attendance_batch_session_id_player_id_unique" UNIQUE("batch_session_id","player_id")',
    );

    const foreignKeys = sql
      .split("--> statement-breakpoint")
      .filter((statement) => /FOREIGN KEY/i.test(statement));
    expect(foreignKeys.length).toBeGreaterThan(0);
    for (const statement of foreignKeys) {
      expect(statement).toMatch(/ON DELETE restrict/i);
    }

    expect(sql).not.toMatch(/DROP (TABLE|COLUMN|CONSTRAINT|INDEX|TYPE)/i);
    expect(sql).not.toMatch(/ALTER TABLE "registrations"/);
  });
});
