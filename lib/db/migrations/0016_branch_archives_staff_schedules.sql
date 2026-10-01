-- Branch records and every related foreign key remain intact in the archive.
ALTER TABLE branches ADD COLUMN archived_at timestamptz;
ALTER TABLE users ADD COLUMN branch_schedules jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX branches_active_clinic_idx ON branches (clinic_id, id) WHERE archived_at IS NULL;
ALTER TABLE users ADD CONSTRAINT users_branch_schedules_array CHECK (jsonb_typeof(branch_schedules) = 'array');
-- Existing single-branch schedules retain their exact days, hours and breaks.
UPDATE users SET branch_schedules = jsonb_build_array(jsonb_build_object('branchId', branch_id, 'workingHours', working_hours, 'breaks', breaks))
WHERE branch_id IS NOT NULL AND role <> 'platform_owner';

--> statement-breakpoint
CREATE TABLE branch_draft_archives (id serial PRIMARY KEY,clinic_id integer NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,snapshot jsonb NOT NULL,archived_at timestamptz NOT NULL DEFAULT now());
