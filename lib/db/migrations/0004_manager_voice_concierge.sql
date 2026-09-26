-- Additive manager voice onboarding. No existing business records are rewritten.
CREATE TABLE "manager_onboarding" (
  "id" serial PRIMARY KEY NOT NULL,
  "clinic_id" integer NOT NULL REFERENCES "clinics"("id"),
  "user_id" integer NOT NULL,
  "stage" text NOT NULL DEFAULT 'name',
  "preferred_name" text,
  "language" text NOT NULL DEFAULT 'ar',
  "consent_version" text,
  "consent_at" timestamptz,
  "revision" integer NOT NULL DEFAULT 0,
  "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "budget" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "busy_id" text,
  "busy_until" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "manager_onboarding_clinic_user_unique" UNIQUE ("clinic_id", "user_id"),
  CONSTRAINT "manager_onboarding_user_clinic_fk" FOREIGN KEY ("clinic_id", "user_id") REFERENCES "users"("clinic_id", "id") ON DELETE CASCADE,
  CONSTRAINT "manager_onboarding_stage_check" CHECK ("stage" IN ('name','choice','conversation','complete','manual')),
  CONSTRAINT "manager_onboarding_language_check" CHECK ("language" IN ('ar','en')),
  CONSTRAINT "manager_onboarding_revision_check" CHECK ("revision" >= 0)
);
--> statement-breakpoint
CREATE INDEX "manager_onboarding_updated_idx" ON "manager_onboarding" ("updated_at");
