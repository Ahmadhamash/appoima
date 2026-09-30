ALTER TABLE services ADD COLUMN follow_up_enabled boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE appointments ADD COLUMN appointment_type text NOT NULL DEFAULT 'standard', ADD COLUMN follow_up_of_id integer,
  ADD COLUMN charge_price numeric(12,3), ADD COLUMN charge_currency text;
--> statement-breakpoint
ALTER TABLE appointments ADD CONSTRAINT appointments_follow_up_context_unique UNIQUE(clinic_id,customer_id,service_id,id);
--> statement-breakpoint
ALTER TABLE appointments ADD CONSTRAINT appointments_follow_up_context_fk FOREIGN KEY(clinic_id,customer_id,service_id,follow_up_of_id) REFERENCES appointments(clinic_id,customer_id,service_id,id),
  ADD CONSTRAINT appointments_follow_up_check CHECK(appointment_type IN ('standard','follow_up') AND ((appointment_type = 'follow_up') = (follow_up_of_id IS NOT NULL)) AND (follow_up_of_id IS NULL OR follow_up_of_id <> id)),
  ADD CONSTRAINT appointments_charge_check CHECK((charge_price IS NULL AND charge_currency IS NULL) OR (charge_price >= 0 AND charge_price <> 'NaN'::numeric AND charge_currency = 'JOD'));
