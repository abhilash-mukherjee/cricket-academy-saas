CREATE TABLE "coach_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"marked_on" date NOT NULL,
	"is_present" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_attendance_academy_coach_batch_day_unique" UNIQUE("academy_id","coach_id","batch_id","marked_on")
);
--> statement-breakpoint
ALTER TABLE "coach_attendance" ADD CONSTRAINT "coach_attendance_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_attendance" ADD CONSTRAINT "coach_attendance_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_attendance" ADD CONSTRAINT "coach_attendance_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;