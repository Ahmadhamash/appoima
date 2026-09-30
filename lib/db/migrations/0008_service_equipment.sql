ALTER TABLE public.services ADD COLUMN required_equipment jsonb NOT NULL DEFAULT '[]'::jsonb;
