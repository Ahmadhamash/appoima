CREATE TYPE "public"."language" AS ENUM('en', 'ar');
--> statement-breakpoint
CREATE TYPE "public"."clinic_status" AS ENUM('active', 'inactive');
--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('platform_owner', 'manager', 'secretary', 'doctor', 'service_provider', 'other_staff');
--> statement-breakpoint
CREATE TABLE "clinics" (
 "id" serial PRIMARY KEY NOT NULL, "name" text NOT NULL, "name_lang" "language" DEFAULT 'en' NOT NULL,
 "status" "clinic_status" DEFAULT 'active' NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
 "id" serial PRIMARY KEY NOT NULL, "clinic_id" integer NOT NULL, "name" text NOT NULL,
 "name_lang" "language" DEFAULT 'en' NOT NULL, "time_zone" text DEFAULT 'Asia/Amman' NOT NULL,
 "opening_hours" jsonb NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "branches_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id")
);
--> statement-breakpoint
CREATE TABLE "users" (
 "id" serial PRIMARY KEY NOT NULL, "clinic_id" integer, "branch_id" integer,
 "email" text NOT NULL, "password_hash" text NOT NULL, "name" text NOT NULL,
 "phone" text, "job_title" text, "role" "user_role" NOT NULL,
 "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "must_change_password" boolean DEFAULT true NOT NULL, "is_active" boolean DEFAULT true NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "users_email_unique" UNIQUE("email"),
 CONSTRAINT "users_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id"),
 CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id")
);
--> statement-breakpoint
CREATE INDEX "users_clinic_idx" ON "users" USING btree ("clinic_id");
--> statement-breakpoint
CREATE TABLE "audit_events" (
 "id" serial PRIMARY KEY NOT NULL, "clinic_id" integer, "actor_user_id" integer,
 "action" text NOT NULL, "entity_type" text, "entity_id" integer, "details" jsonb,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_clinic_idx" ON "audit_events" USING btree ("clinic_id");
--> statement-breakpoint
CREATE TABLE "session" ("sid" text PRIMARY KEY NOT NULL, "sess" json NOT NULL, "expire" timestamp(6) NOT NULL);
--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "session" USING btree ("expire");
