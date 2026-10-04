ALTER TABLE package_templates ADD COLUMN usage_rules text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE package_templates ADD COLUMN description text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE patient_packages ADD COLUMN usage_rules text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE patient_packages ADD COLUMN description text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE billing_invoices ADD COLUMN promotion jsonb;
--> statement-breakpoint
ALTER TABLE appointments ADD COLUMN promotion jsonb;
--> statement-breakpoint
CREATE TABLE promotional_offers (
 id serial PRIMARY KEY, clinic_id integer NOT NULL REFERENCES clinics(id), name text NOT NULL,
 service_ids jsonb NOT NULL DEFAULT '[]', package_ids jsonb NOT NULL DEFAULT '[]', kind text NOT NULL, value numeric(12,3) NOT NULL,
 starts_on date NOT NULL, ends_on date NOT NULL, eligibility jsonb NOT NULL, is_active boolean NOT NULL DEFAULT true,
 created_by integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT promotional_offers_clinic_id_unique UNIQUE(clinic_id,id),
 FOREIGN KEY(clinic_id,created_by) REFERENCES users(clinic_id,id),
 CONSTRAINT promotional_offers_period_check CHECK(ends_on >= starts_on),
 CONSTRAINT promotional_offers_value_check CHECK(kind IN ('percent','amount','price') AND value >= 0 AND value <> 'NaN'::numeric AND (kind <> 'percent' OR value <= 100))
);
--> statement-breakpoint
CREATE TABLE package_notifications (
 id serial PRIMARY KEY, clinic_id integer NOT NULL, package_id integer NOT NULL, customer_id integer NOT NULL, appointment_id integer NOT NULL,
 event text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT package_notifications_clinic_id_unique UNIQUE(clinic_id,id),
 CONSTRAINT package_notifications_event_unique UNIQUE(clinic_id,appointment_id,event),
 FOREIGN KEY(clinic_id,customer_id,package_id) REFERENCES patient_packages(clinic_id,customer_id,id),
 FOREIGN KEY(clinic_id,appointment_id) REFERENCES appointments(clinic_id,id),
 FOREIGN KEY(clinic_id,customer_id) REFERENCES customers(clinic_id,id),
 CONSTRAINT package_notifications_event_check CHECK(event IN ('final_check_in','final_completed'))
);
--> statement-breakpoint
CREATE INDEX package_notifications_clinic_idx ON package_notifications(clinic_id,id);
--> statement-breakpoint
CREATE TABLE package_notification_reads (
 id serial PRIMARY KEY, clinic_id integer NOT NULL, notification_id integer NOT NULL, user_id integer NOT NULL,
 CONSTRAINT package_notification_reads_user_unique UNIQUE(clinic_id,notification_id,user_id),
 FOREIGN KEY(clinic_id,notification_id) REFERENCES package_notifications(clinic_id,id),
 FOREIGN KEY(clinic_id,user_id) REFERENCES users(clinic_id,id)
);
