CREATE TABLE "billing_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"clinic_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"appointment_id" integer,
	"name" text NOT NULL,
	"original_price" numeric(12, 3) NOT NULL,
	"discount" numeric(12, 3) DEFAULT '0' NOT NULL,
	"deposit_policy" text DEFAULT 'refundable' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_invoices_clinic_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "billing_invoices_patient_context_unique" UNIQUE("clinic_id","customer_id","id"),
	CONSTRAINT "billing_invoices_price_check" CHECK ("billing_invoices"."original_price" >= 0 AND "billing_invoices"."discount" BETWEEN 0 AND "billing_invoices"."original_price" AND "billing_invoices"."original_price" <> 'NaN'::numeric),
	CONSTRAINT "billing_invoices_deposit_policy_check" CHECK ("billing_invoices"."deposit_policy" IN ('refundable','non_refundable','wallet'))
);
--> statement-breakpoint
CREATE TABLE "package_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"clinic_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"package_id" integer NOT NULL,
	"appointment_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	CONSTRAINT "package_bookings_appointment_unique" UNIQUE("clinic_id","appointment_id")
);
--> statement-breakpoint
CREATE TABLE "package_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"clinic_id" integer NOT NULL,
	"name" text NOT NULL,
	"items" jsonb NOT NULL,
	"original_price" numeric(12, 3) NOT NULL,
	"discount" numeric(12, 3) DEFAULT '0' NOT NULL,
	"interval_days" integer DEFAULT 7 NOT NULL,
	"expiry_days" integer,
	"plan" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "package_templates_clinic_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "package_templates_price_check" CHECK ("package_templates"."original_price" >= 0 AND "package_templates"."discount" BETWEEN 0 AND "package_templates"."original_price" AND "package_templates"."original_price" <> 'NaN'::numeric)
);
--> statement-breakpoint
CREATE TABLE "patient_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"clinic_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"template_id" integer,
	"invoice_id" integer NOT NULL,
	"name" text NOT NULL,
	"items" jsonb NOT NULL,
	"interval_days" integer DEFAULT 7 NOT NULL,
	"plan" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_packages_clinic_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "patient_packages_patient_context_unique" UNIQUE("clinic_id","customer_id","id"),
	CONSTRAINT "patient_packages_invoice_unique" UNIQUE("clinic_id","invoice_id"),
	CONSTRAINT "patient_packages_status_check" CHECK ("patient_packages"."status" IN ('active','completed','expired','frozen','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "payment_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"clinic_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"invoice_id" integer NOT NULL,
	"kind" text NOT NULL,
	"method" text NOT NULL,
	"amount" numeric(12, 3) NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"group_key" text NOT NULL,
	"actor_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_entries_amount_check" CHECK ("payment_entries"."amount" > 0 AND "payment_entries"."amount" <> 'NaN'::numeric),
	CONSTRAINT "payment_entries_kind_check" CHECK ("payment_entries"."kind" IN ('payment','deposit','refund','deposit_refund','deposit_wallet','wallet_payment')),
	CONSTRAINT "payment_entries_method_check" CHECK ("payment_entries"."method" IN ('cash','visa','cliq','bank','online','other','wallet'))
);
--> statement-breakpoint
CREATE TABLE "package_session_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"clinic_id" integer NOT NULL,
	"package_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"appointment_id" integer,
	"note" text DEFAULT '' NOT NULL,
	"actor_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_entries_appointment_unique" UNIQUE("clinic_id","appointment_id")
);
--> statement-breakpoint
CREATE TABLE "patient_wallet_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"clinic_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"invoice_id" integer,
	"amount" numeric(12, 3) NOT NULL,
	"note" text NOT NULL,
	"actor_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_entries_amount_check" CHECK ("patient_wallet_entries"."amount" <> 0 AND "patient_wallet_entries"."amount" <> 'NaN'::numeric)
);
--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_clinic_id_customer_id_customers_clinic_id_id_fk" FOREIGN KEY ("clinic_id","customer_id") REFERENCES "public"."customers"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_clinic_id_appointment_id_appointments_clinic_id_id_fk" FOREIGN KEY ("clinic_id","appointment_id") REFERENCES "public"."appointments"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_clinic_id_created_by_users_clinic_id_id_fk" FOREIGN KEY ("clinic_id","created_by") REFERENCES "public"."users"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_bookings" ADD CONSTRAINT "package_bookings_clinic_id_customer_id_package_id_patient_packages_clinic_id_customer_id_id_fk" FOREIGN KEY ("clinic_id","customer_id","package_id") REFERENCES "public"."patient_packages"("clinic_id","customer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_bookings" ADD CONSTRAINT "package_bookings_clinic_id_appointment_id_appointments_clinic_id_id_fk" FOREIGN KEY ("clinic_id","appointment_id") REFERENCES "public"."appointments"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_bookings" ADD CONSTRAINT "package_bookings_clinic_id_service_id_services_clinic_id_id_fk" FOREIGN KEY ("clinic_id","service_id") REFERENCES "public"."services"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_templates" ADD CONSTRAINT "package_templates_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_templates" ADD CONSTRAINT "package_templates_clinic_id_created_by_users_clinic_id_id_fk" FOREIGN KEY ("clinic_id","created_by") REFERENCES "public"."users"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_clinic_id_customer_id_invoice_id_billing_invoices_clinic_id_customer_id_id_fk" FOREIGN KEY ("clinic_id","customer_id","invoice_id") REFERENCES "public"."billing_invoices"("clinic_id","customer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_clinic_id_template_id_package_templates_clinic_id_id_fk" FOREIGN KEY ("clinic_id","template_id") REFERENCES "public"."package_templates"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_clinic_id_created_by_users_clinic_id_id_fk" FOREIGN KEY ("clinic_id","created_by") REFERENCES "public"."users"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_entries" ADD CONSTRAINT "payment_entries_clinic_id_customer_id_invoice_id_billing_invoices_clinic_id_customer_id_id_fk" FOREIGN KEY ("clinic_id","customer_id","invoice_id") REFERENCES "public"."billing_invoices"("clinic_id","customer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_entries" ADD CONSTRAINT "payment_entries_clinic_id_actor_id_users_clinic_id_id_fk" FOREIGN KEY ("clinic_id","actor_id") REFERENCES "public"."users"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_session_entries" ADD CONSTRAINT "package_session_entries_clinic_id_package_id_patient_packages_clinic_id_id_fk" FOREIGN KEY ("clinic_id","package_id") REFERENCES "public"."patient_packages"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_session_entries" ADD CONSTRAINT "package_session_entries_clinic_id_service_id_services_clinic_id_id_fk" FOREIGN KEY ("clinic_id","service_id") REFERENCES "public"."services"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_session_entries" ADD CONSTRAINT "package_session_entries_clinic_id_appointment_id_appointments_clinic_id_id_fk" FOREIGN KEY ("clinic_id","appointment_id") REFERENCES "public"."appointments"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_session_entries" ADD CONSTRAINT "package_session_entries_clinic_id_actor_id_users_clinic_id_id_fk" FOREIGN KEY ("clinic_id","actor_id") REFERENCES "public"."users"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_wallet_entries" ADD CONSTRAINT "patient_wallet_entries_clinic_id_customer_id_customers_clinic_id_id_fk" FOREIGN KEY ("clinic_id","customer_id") REFERENCES "public"."customers"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_wallet_entries" ADD CONSTRAINT "patient_wallet_entries_clinic_id_customer_id_invoice_id_billing_invoices_clinic_id_customer_id_id_fk" FOREIGN KEY ("clinic_id","customer_id","invoice_id") REFERENCES "public"."billing_invoices"("clinic_id","customer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_wallet_entries" ADD CONSTRAINT "patient_wallet_entries_clinic_id_actor_id_users_clinic_id_id_fk" FOREIGN KEY ("clinic_id","actor_id") REFERENCES "public"."users"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_invoices_appointment_unique" ON "billing_invoices" USING btree ("clinic_id","appointment_id");--> statement-breakpoint
CREATE INDEX "patient_packages_patient_idx" ON "patient_packages" USING btree ("clinic_id","customer_id");--> statement-breakpoint
CREATE INDEX "payment_entries_invoice_idx" ON "payment_entries" USING btree ("clinic_id","invoice_id","id");--> statement-breakpoint
CREATE INDEX "wallet_entries_patient_idx" ON "patient_wallet_entries" USING btree ("clinic_id","customer_id","id");
--> statement-breakpoint
ALTER TABLE package_bookings ADD CONSTRAINT package_bookings_patient_service_fk FOREIGN KEY (clinic_id,customer_id,service_id,appointment_id) REFERENCES appointments(clinic_id,customer_id,service_id,id);
--> statement-breakpoint
CREATE INDEX session_entries_package_idx ON package_session_entries(clinic_id,package_id,service_id);
--> statement-breakpoint
CREATE INDEX package_bookings_package_idx ON package_bookings(clinic_id,package_id,service_id);
--> statement-breakpoint
CREATE FUNCTION billing_immutable_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Billing ledgers are append only' USING ERRCODE='23514'; END $$;
--> statement-breakpoint
CREATE TRIGGER payment_entries_immutable BEFORE UPDATE OR DELETE ON payment_entries FOR EACH ROW EXECUTE FUNCTION billing_immutable_ledger();
--> statement-breakpoint
CREATE TRIGGER wallet_entries_immutable BEFORE UPDATE OR DELETE ON patient_wallet_entries FOR EACH ROW EXECUTE FUNCTION billing_immutable_ledger();
--> statement-breakpoint
CREATE TRIGGER session_entries_immutable BEFORE UPDATE OR DELETE ON package_session_entries FOR EACH ROW EXECUTE FUNCTION billing_immutable_ledger();
--> statement-breakpoint
CREATE FUNCTION billing_validate_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE net numeric; deposits numeric; agreed numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(7140002,NEW.clinic_id);
 SELECT original_price-discount INTO agreed FROM billing_invoices WHERE clinic_id=NEW.clinic_id AND id=NEW.invoice_id;
 SELECT COALESCE(SUM(CASE WHEN kind IN ('refund','deposit_refund','deposit_wallet') THEN -amount ELSE amount END),0),
 COALESCE(SUM(CASE WHEN kind='deposit' THEN amount WHEN kind IN ('deposit_refund','deposit_wallet') THEN -amount ELSE 0 END),0)
 INTO net,deposits FROM payment_entries WHERE clinic_id=NEW.clinic_id AND invoice_id=NEW.invoice_id;
 IF net<0 OR net>agreed OR deposits<0 OR deposits>net THEN RAISE EXCEPTION 'Invalid payment ledger balance' USING ERRCODE='23514',CONSTRAINT='billing_payment_balance_guard'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER billing_payment_balance_guard AFTER INSERT ON payment_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing_validate_payment();
--> statement-breakpoint
CREATE FUNCTION billing_validate_wallet() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(7140002,NEW.clinic_id);
 IF (SELECT COALESCE(SUM(amount),0) FROM patient_wallet_entries WHERE clinic_id=NEW.clinic_id AND customer_id=NEW.customer_id)<0 THEN RAISE EXCEPTION 'Wallet credit cannot be negative' USING ERRCODE='23514',CONSTRAINT='billing_wallet_balance_guard'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER billing_wallet_balance_guard AFTER INSERT ON patient_wallet_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing_validate_wallet();
--> statement-breakpoint
CREATE FUNCTION billing_validate_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed integer; consumed integer; reserved integer;
BEGIN
 PERFORM pg_advisory_xact_lock(7140002,NEW.clinic_id);
 SELECT (item->>'quantity')::integer INTO allowed FROM patient_packages p CROSS JOIN LATERAL jsonb_array_elements(p.items) item WHERE p.clinic_id=NEW.clinic_id AND p.id=NEW.package_id AND (item->>'serviceId')::integer=NEW.service_id;
 SELECT COUNT(*) INTO consumed FROM package_session_entries WHERE clinic_id=NEW.clinic_id AND package_id=NEW.package_id AND service_id=NEW.service_id;
 SELECT COUNT(*) INTO reserved FROM package_bookings b JOIN appointments a ON a.clinic_id=b.clinic_id AND a.id=b.appointment_id WHERE b.clinic_id=NEW.clinic_id AND b.package_id=NEW.package_id AND b.service_id=NEW.service_id AND a.status IN ('pending','confirmed','checked_in','in_service');
 IF allowed IS NULL OR consumed+reserved>allowed THEN RAISE EXCEPTION 'No session entitlement remains' USING ERRCODE='23514',CONSTRAINT='billing_session_balance_guard'; END IF;
 IF TG_TABLE_NAME='package_session_entries' AND NEW.appointment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM package_bookings b JOIN appointments a ON a.clinic_id=b.clinic_id AND a.id=b.appointment_id WHERE b.clinic_id=NEW.clinic_id AND b.package_id=NEW.package_id AND b.service_id=NEW.service_id AND b.appointment_id=NEW.appointment_id AND a.status='completed') THEN RAISE EXCEPTION 'Session requires a completed package appointment' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER billing_session_balance_guard AFTER INSERT ON package_session_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing_validate_sessions();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER billing_reservation_balance_guard AFTER INSERT ON package_bookings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing_validate_sessions();
