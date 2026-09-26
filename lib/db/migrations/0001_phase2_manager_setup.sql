CREATE TYPE "public"."service_category" AS ENUM('Hair', 'Nails', 'Skin', 'Laser', 'Massage', 'Makeup', 'Other');
--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('available', 'maintenance');
--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_clinic_id_unique" UNIQUE("clinic_id", "id");
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name_lang" "language" DEFAULT 'en' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "working_hours" jsonb DEFAULT '{"mon":[],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "breaks" jsonb DEFAULT '{"mon":[],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "time_off" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_clinic_id_unique" UNIQUE("clinic_id", "id");
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_clinic_fk" FOREIGN KEY ("clinic_id", "branch_id") REFERENCES "public"."branches"("clinic_id", "id");
--> statement-breakpoint
CREATE TABLE "services" (
 "id" serial PRIMARY KEY NOT NULL, "clinic_id" integer NOT NULL, "branch_id" integer,
 "name" text NOT NULL, "name_lang" "language" DEFAULT 'en' NOT NULL,
 "duration_minutes" integer NOT NULL, "price" numeric(12, 3) NOT NULL,
 "currency" text DEFAULT 'JOD' NOT NULL, "category" "service_category" NOT NULL,
 "is_active" boolean DEFAULT true NOT NULL, "requires_room" boolean DEFAULT false NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "services_clinic_id_unique" UNIQUE("clinic_id", "id"),
 CONSTRAINT "services_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id"),
 CONSTRAINT "services_branch_clinic_fk" FOREIGN KEY ("clinic_id", "branch_id") REFERENCES "public"."branches"("clinic_id", "id"),
 CONSTRAINT "services_duration_check" CHECK ("duration_minutes" > 0 AND "duration_minutes" <= 1440),
 CONSTRAINT "services_price_check" CHECK ("price" >= 0)
);
--> statement-breakpoint
CREATE INDEX "services_clinic_idx" ON "services" USING btree ("clinic_id");
--> statement-breakpoint
CREATE TABLE "rooms" (
 "id" serial PRIMARY KEY NOT NULL, "clinic_id" integer NOT NULL, "branch_id" integer NOT NULL,
 "name" text NOT NULL, "name_lang" "language" DEFAULT 'en' NOT NULL,
 "capacity" integer DEFAULT 1 NOT NULL, "status" "room_status" DEFAULT 'available' NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "rooms_clinic_id_unique" UNIQUE("clinic_id", "id"),
 CONSTRAINT "rooms_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id"),
 CONSTRAINT "rooms_branch_clinic_fk" FOREIGN KEY ("clinic_id", "branch_id") REFERENCES "public"."branches"("clinic_id", "id"),
 CONSTRAINT "rooms_capacity_check" CHECK ("capacity" > 0 AND "capacity" <= 1000)
);
--> statement-breakpoint
CREATE INDEX "rooms_clinic_idx" ON "rooms" USING btree ("clinic_id");
--> statement-breakpoint
CREATE TABLE "customers" (
 "id" serial PRIMARY KEY NOT NULL, "clinic_id" integer NOT NULL, "branch_id" integer,
 "name" text NOT NULL, "name_lang" "language" DEFAULT 'en' NOT NULL,
 "phone" text, "email" text, "notes" text DEFAULT '' NOT NULL, "sensitive_notes" text DEFAULT '' NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "customers_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id"),
 CONSTRAINT "customers_branch_clinic_fk" FOREIGN KEY ("clinic_id", "branch_id") REFERENCES "public"."branches"("clinic_id", "id"),
 CONSTRAINT "customers_contact_check" CHECK (nullif(trim("phone"), '') IS NOT NULL OR nullif(trim("email"), '') IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX "customers_clinic_name_idx" ON "customers" USING btree ("clinic_id", "name");
--> statement-breakpoint
CREATE TABLE "service_employees" (
 "clinic_id" integer NOT NULL, "service_id" integer NOT NULL, "employee_id" integer NOT NULL,
 CONSTRAINT "service_employees_service_id_employee_id_pk" PRIMARY KEY("service_id", "employee_id"),
 CONSTRAINT "service_employees_service_clinic_fk" FOREIGN KEY ("clinic_id", "service_id") REFERENCES "public"."services"("clinic_id", "id") ON DELETE cascade,
 CONSTRAINT "service_employees_user_clinic_fk" FOREIGN KEY ("clinic_id", "employee_id") REFERENCES "public"."users"("clinic_id", "id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "service_employees_employee_idx" ON "service_employees" USING btree ("clinic_id", "employee_id");
--> statement-breakpoint
CREATE TABLE "room_services" (
 "clinic_id" integer NOT NULL, "room_id" integer NOT NULL, "service_id" integer NOT NULL,
 CONSTRAINT "room_services_room_id_service_id_pk" PRIMARY KEY("room_id", "service_id"),
 CONSTRAINT "room_services_room_clinic_fk" FOREIGN KEY ("clinic_id", "room_id") REFERENCES "public"."rooms"("clinic_id", "id") ON DELETE cascade,
 CONSTRAINT "room_services_service_clinic_fk" FOREIGN KEY ("clinic_id", "service_id") REFERENCES "public"."services"("clinic_id", "id") ON DELETE cascade
);
--> statement-breakpoint
-- Preserve Phase 1 ranges while normalizing all weekdays to arrays. Never invent hours.
UPDATE "branches" AS b SET "opening_hours" = (
 SELECT jsonb_object_agg(day, CASE
   WHEN jsonb_typeof(b.opening_hours -> day) = 'array' THEN b.opening_hours -> day
   WHEN jsonb_typeof(b.opening_hours -> day) = 'object' THEN jsonb_build_array(b.opening_hours -> day)
   ELSE '[]'::jsonb END)
 FROM unnest(ARRAY['mon','tue','wed','thu','fri','sat','sun']) AS days(day)
);
