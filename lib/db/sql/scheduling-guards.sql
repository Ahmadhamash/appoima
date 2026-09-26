-- Required in every environment, including disposable drizzle-kit push databases.
-- Existing overlaps deliberately cause failure; never silently remove or alter appointments.
CREATE EXTENSION IF NOT EXISTS btree_gist;
DO $guards$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.appointments'::regclass AND conname = 'appointments_employee_no_overlap') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_employee_no_overlap
      EXCLUDE USING gist (clinic_id WITH =, employee_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
      WHERE (status <> 'cancelled'::appointment_status);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.appointments'::regclass AND conname = 'appointments_room_no_overlap') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_room_no_overlap
      EXCLUDE USING gist (clinic_id WITH =, room_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
      WHERE (room_id IS NOT NULL AND status <> 'cancelled'::appointment_status);
  END IF;
END $guards$;
