CREATE TYPE "public"."batch_session_attendance_mark" AS ENUM('present', 'absent');--> statement-breakpoint
CREATE TABLE "batch_session_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"batch_session_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"mark" "batch_session_attendance_mark" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_session_attendance_batch_session_id_player_id_unique" UNIQUE("batch_session_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "batch_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"session_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_sessions_academy_id_batch_id_session_date_unique" UNIQUE("academy_id","batch_id","session_date")
);
--> statement-breakpoint
CREATE TABLE "enrollment_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"paused_on" date NOT NULL,
	"planned_last_paused_on" date,
	"resumed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollment_pauses_planned_last_paused_on" CHECK ("enrollment_pauses"."planned_last_paused_on" is null or "enrollment_pauses"."planned_last_paused_on" >= "enrollment_pauses"."paused_on"),
	CONSTRAINT "enrollment_pauses_resumed_on" CHECK ("enrollment_pauses"."resumed_on" is null or "enrollment_pauses"."resumed_on" >= "enrollment_pauses"."paused_on")
);
--> statement-breakpoint
ALTER TABLE "enrollments" ALTER COLUMN "registration_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "guardian_full_name" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "guardian_phone" text;--> statement-breakpoint
ALTER TABLE "batch_session_attendance" ADD CONSTRAINT "batch_session_attendance_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_session_attendance" ADD CONSTRAINT "batch_session_attendance_batch_session_id_batch_sessions_id_fk" FOREIGN KEY ("batch_session_id") REFERENCES "public"."batch_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_session_attendance" ADD CONSTRAINT "batch_session_attendance_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_session_attendance" ADD CONSTRAINT "batch_session_attendance_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_sessions" ADD CONSTRAINT "batch_sessions_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_sessions" ADD CONSTRAINT "batch_sessions_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_pauses" ADD CONSTRAINT "enrollment_pauses_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_pauses" ADD CONSTRAINT "enrollment_pauses_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_pauses_one_open_per_enrollment" ON "enrollment_pauses" USING btree ("enrollment_id") WHERE "enrollment_pauses"."resumed_on" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_registration_id_unique" ON "enrollments" USING btree ("registration_id") WHERE "enrollments"."registration_id" is not null;