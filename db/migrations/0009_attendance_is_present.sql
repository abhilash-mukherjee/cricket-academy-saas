ALTER TABLE "batch_session_attendance" ADD COLUMN "is_present" boolean;--> statement-breakpoint
UPDATE "batch_session_attendance" SET "is_present" = CASE "mark" WHEN 'present' THEN true WHEN 'absent' THEN false END;--> statement-breakpoint
ALTER TABLE "batch_session_attendance" ALTER COLUMN "is_present" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "batch_session_attendance" DROP COLUMN "mark";--> statement-breakpoint
DROP TYPE "public"."batch_session_attendance_mark";
