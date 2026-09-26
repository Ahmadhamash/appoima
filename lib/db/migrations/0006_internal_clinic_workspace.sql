-- Additive only. No changes to clinics, patients, services, appointments or existing history.
CREATE TABLE "clinic_workspaces" (
  "clinic_id" integer PRIMARY KEY REFERENCES "clinics"("id"),
  "revision" integer NOT NULL DEFAULT 1,
  "profile" jsonb NOT NULL,
  "sources" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "clinic_workspace_revision_positive" CHECK ("revision" > 0)
);
