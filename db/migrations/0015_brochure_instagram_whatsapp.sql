ALTER TABLE "academies" ADD COLUMN "instagram_handle" text;--> statement-breakpoint
ALTER TABLE "academies" ADD COLUMN "whatsapp" text;--> statement-breakpoint
ALTER TABLE "academies" ADD CONSTRAINT "academies_instagram_handle_format" CHECK ("academies"."instagram_handle" is null or "academies"."instagram_handle" ~ '^[A-Za-z0-9._]{1,30}$');