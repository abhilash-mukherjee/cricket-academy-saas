ALTER TABLE "batch_fee_options" DROP CONSTRAINT "batch_fee_options_batch_id_term_months_unique";--> statement-breakpoint
ALTER TABLE "batch_fee_options" ADD COLUMN "days_per_week" integer;--> statement-breakpoint
ALTER TABLE "batch_fee_options" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "batch_fee_options" ADD COLUMN "is_offered" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "days_per_week" integer;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "days_per_week" integer;--> statement-breakpoint
UPDATE "batch_fee_options" SET "days_per_week" = 1 WHERE "days_per_week" IS NULL;--> statement-breakpoint
UPDATE "registrations" AS "r" SET "days_per_week" = "f"."days_per_week" FROM "batch_fee_options" AS "f" WHERE "r"."batch_fee_option_id" = "f"."id" AND "r"."days_per_week" IS NULL;--> statement-breakpoint
UPDATE "enrollments" AS "e" SET "days_per_week" = "r"."days_per_week" FROM "registrations" AS "r" WHERE "e"."registration_id" = "r"."id" AND "e"."days_per_week" IS NULL;--> statement-breakpoint
ALTER TABLE "batch_fee_options" ALTER COLUMN "days_per_week" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollments" ALTER COLUMN "days_per_week" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ALTER COLUMN "days_per_week" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "batch_fee_options" ADD CONSTRAINT "batch_fee_options_batch_id_days_per_week_term_months_unique" UNIQUE("batch_id","days_per_week","term_months");--> statement-breakpoint
ALTER TABLE "batch_fee_options" ADD CONSTRAINT "batch_fee_options_days_per_week_range" CHECK ("batch_fee_options"."days_per_week" between 1 and 7);--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_days_per_week_range" CHECK ("enrollments"."days_per_week" between 1 and 7);--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_days_per_week_range" CHECK ("registrations"."days_per_week" between 1 and 7);
