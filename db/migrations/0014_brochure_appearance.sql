ALTER TABLE "academies" ADD COLUMN "about_label" text DEFAULT 'About Us' NOT NULL;--> statement-breakpoint
ALTER TABLE "academies" ADD COLUMN "about" text;--> statement-breakpoint
ALTER TABLE "academies" ADD COLUMN "logo_storage_key" text;--> statement-breakpoint
ALTER TABLE "academies" ADD COLUMN "theme_mode" text DEFAULT 'dark' NOT NULL;--> statement-breakpoint
ALTER TABLE "academies" ADD COLUMN "theme_accent" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "academies" ADD CONSTRAINT "academies_about_label_not_blank" CHECK (btrim("academies"."about_label") <> '');--> statement-breakpoint
ALTER TABLE "academies" ADD CONSTRAINT "academies_theme_mode_check" CHECK ("academies"."theme_mode" in ('dark', 'light'));--> statement-breakpoint
ALTER TABLE "academies" ADD CONSTRAINT "academies_theme_accent_check" CHECK ("academies"."theme_accent" in ('default', 'emerald', 'blue', 'crimson', 'amber', 'violet', 'teal', 'orange'));