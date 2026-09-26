-- Additive only. Existing services/appointments, categories and tenant keys are untouched.
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "definition" jsonb;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "service_intake" jsonb;
