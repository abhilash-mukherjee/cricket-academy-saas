DROP TRIGGER "batch_fee_options_fill_term_days" ON "batch_fee_options";--> statement-breakpoint
DROP TRIGGER "registrations_fill_term_days" ON "registrations";--> statement-breakpoint
DROP TRIGGER "enrollments_fill_term_days" ON "enrollments";--> statement-breakpoint
DROP FUNCTION "fill_term_days_from_term_months"();--> statement-breakpoint
ALTER TABLE "batch_fee_options" DROP COLUMN "term_months";--> statement-breakpoint
ALTER TABLE "registrations" DROP COLUMN "term_months";--> statement-breakpoint
ALTER TABLE "enrollments" DROP COLUMN "term_months";