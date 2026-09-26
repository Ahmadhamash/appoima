-- Phase 3 schema. Hand-authored, pending execution and Drizzle snapshot verification.
CREATE TYPE public.appointment_status AS ENUM ('pending','confirmed','checked_in','in_service','completed','cancelled','no_show');
--> statement-breakpoint
CREATE TYPE public.appointment_event AS ENUM ('created','status_changed','rescheduled','notes_updated');
--> statement-breakpoint
ALTER TABLE public.customers ADD CONSTRAINT customers_clinic_id_unique UNIQUE (clinic_id, id);
--> statement-breakpoint
ALTER TABLE public.rooms ADD CONSTRAINT rooms_clinic_branch_id_unique UNIQUE (clinic_id, branch_id, id);
--> statement-breakpoint
CREATE TABLE public.appointments (
 id serial PRIMARY KEY, clinic_id integer NOT NULL CONSTRAINT appointments_clinic_id_clinics_id_fk REFERENCES public.clinics(id), branch_id integer NOT NULL,
 customer_id integer NOT NULL, service_id integer NOT NULL, employee_id integer NOT NULL, room_id integer,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, duration_minutes integer NOT NULL, requires_room boolean NOT NULL,
 status public.appointment_status NOT NULL DEFAULT 'pending', notes text NOT NULL DEFAULT '', notes_lang public.language NOT NULL DEFAULT 'en',
 created_by integer NOT NULL, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT appointments_clinic_id_unique UNIQUE(clinic_id,id),
 CONSTRAINT appointments_branch_clinic_fk FOREIGN KEY(clinic_id,branch_id) REFERENCES public.branches(clinic_id,id),
 CONSTRAINT appointments_customer_clinic_fk FOREIGN KEY(clinic_id,customer_id) REFERENCES public.customers(clinic_id,id),
 CONSTRAINT appointments_service_clinic_fk FOREIGN KEY(clinic_id,service_id) REFERENCES public.services(clinic_id,id),
 CONSTRAINT appointments_employee_clinic_fk FOREIGN KEY(clinic_id,employee_id) REFERENCES public.users(clinic_id,id),
 CONSTRAINT appointments_creator_clinic_fk FOREIGN KEY(clinic_id,created_by) REFERENCES public.users(clinic_id,id),
 CONSTRAINT appointments_room_branch_fk FOREIGN KEY(clinic_id,branch_id,room_id) REFERENCES public.rooms(clinic_id,branch_id,id),
 CONSTRAINT appointments_time_check CHECK(ends_at > starts_at AND ends_at = starts_at + duration_minutes * interval '1 minute'),
 CONSTRAINT appointments_duration_check CHECK(duration_minutes > 0 AND duration_minutes <= 1440),
 CONSTRAINT appointments_room_required_check CHECK(NOT requires_room OR room_id IS NOT NULL),
 CONSTRAINT appointments_version_check CHECK(version > 0)
);
--> statement-breakpoint
CREATE INDEX appointments_clinic_start_idx ON public.appointments(clinic_id, starts_at);
--> statement-breakpoint
CREATE INDEX appointments_customer_start_idx ON public.appointments(clinic_id, customer_id, starts_at);
--> statement-breakpoint
CREATE INDEX appointments_employee_start_idx ON public.appointments(clinic_id, employee_id, starts_at);
--> statement-breakpoint
CREATE TABLE public.appointment_status_history (
 id serial PRIMARY KEY, clinic_id integer NOT NULL, appointment_id integer NOT NULL, event public.appointment_event NOT NULL,
 from_status public.appointment_status, to_status public.appointment_status NOT NULL, actor_id integer NOT NULL,
 at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL DEFAULT '', "before" jsonb, "after" jsonb NOT NULL,
 CONSTRAINT appointment_history_appointment_clinic_fk FOREIGN KEY(clinic_id,appointment_id) REFERENCES public.appointments(clinic_id,id) ON DELETE CASCADE,
 CONSTRAINT appointment_history_actor_clinic_fk FOREIGN KEY(clinic_id,actor_id) REFERENCES public.users(clinic_id,id)
);
--> statement-breakpoint
CREATE INDEX appointment_history_appointment_idx ON public.appointment_status_history(clinic_id,appointment_id,id);
--> statement-breakpoint
CREATE TABLE public.scheduling_commands (
 id serial PRIMARY KEY, clinic_id integer NOT NULL, actor_id integer NOT NULL, key text NOT NULL, request_hash text NOT NULL,
 operation text NOT NULL, result_id integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT scheduling_commands_actor_key_unique UNIQUE(clinic_id,actor_id,key),
 CONSTRAINT scheduling_commands_actor_clinic_fk FOREIGN KEY(clinic_id,actor_id) REFERENCES public.users(clinic_id,id) ON DELETE CASCADE
);
--> statement-breakpoint
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
