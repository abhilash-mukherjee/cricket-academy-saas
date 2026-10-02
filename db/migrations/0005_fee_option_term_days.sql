ALTER TABLE "batch_fee_options" ADD COLUMN "term_days" integer;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "term_days" integer;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "term_days" integer;--> statement-breakpoint
UPDATE "batch_fee_options" SET "term_days" = "term_months" * 30 WHERE "term_days" IS NULL;--> statement-breakpoint
UPDATE "registrations" SET "term_days" = "term_months" * 30 WHERE "term_days" IS NULL;--> statement-breakpoint
UPDATE "enrollments" SET "term_days" = "term_months" * 30 WHERE "term_days" IS NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "fill_term_days_from_term_months"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.term_days IS NULL THEN
    NEW.term_days := NEW.term_months * 30;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "batch_fee_options_fill_term_days" BEFORE INSERT ON "batch_fee_options" FOR EACH ROW EXECUTE FUNCTION "fill_term_days_from_term_months"();--> statement-breakpoint
CREATE TRIGGER "registrations_fill_term_days" BEFORE INSERT ON "registrations" FOR EACH ROW EXECUTE FUNCTION "fill_term_days_from_term_months"();--> statement-breakpoint
CREATE TRIGGER "enrollments_fill_term_days" BEFORE INSERT ON "enrollments" FOR EACH ROW EXECUTE FUNCTION "fill_term_days_from_term_months"();--> statement-breakpoint
ALTER TABLE "batch_fee_options" ALTER COLUMN "term_days" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ALTER COLUMN "term_days" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollments" ALTER COLUMN "term_days" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "batch_fee_options" ALTER COLUMN "term_months" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ALTER COLUMN "term_months" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollments" ALTER COLUMN "term_months" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "batch_fee_options" DROP CONSTRAINT "batch_fee_options_batch_id_days_per_week_term_months_unique";--> statement-breakpoint
ALTER TABLE "batch_fee_options" ADD CONSTRAINT "batch_fee_options_batch_id_days_per_week_term_days_unique" UNIQUE("batch_id","days_per_week","term_days");