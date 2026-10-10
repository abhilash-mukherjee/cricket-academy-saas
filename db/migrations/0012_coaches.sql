CREATE TABLE "coaches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coaches_name_length" CHECK (char_length("coaches"."name") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coaches_academy_id_name_unique" ON "coaches" USING btree ("academy_id",lower(btrim("name")));