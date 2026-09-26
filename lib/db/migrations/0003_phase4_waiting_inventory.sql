-- Hand-authored Phase 4 migration. Live execution and snapshot generation remain acceptance gates.
CREATE TYPE waiting_status AS ENUM ('waiting','offered','booked','declined','expired');
--> statement-breakpoint
CREATE TYPE waiting_offer_status AS ENUM ('offered','booked','declined','unavailable','expired');
--> statement-breakpoint
CREATE TYPE inventory_movement_kind AS ENUM ('receipt','adjustment','consumption');
--> statement-breakpoint
CREATE TYPE inventory_unit AS ENUM ('piece','pair','box','ml','l','g','kg');
--> statement-breakpoint
CREATE TABLE waiting_list_entries (
 id serial PRIMARY KEY, clinic_id integer NOT NULL, branch_id integer NOT NULL,
 customer_id integer NOT NULL, service_id integer NOT NULL, preferred_employee_id integer,
 window_start timestamptz NOT NULL, window_end timestamptz NOT NULL, note text NOT NULL DEFAULT '', note_lang language NOT NULL DEFAULT 'en',
 status waiting_status NOT NULL DEFAULT 'waiting', version integer NOT NULL DEFAULT 1, created_by integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT waiting_entries_clinic_id_unique UNIQUE(clinic_id,id),
 CONSTRAINT waiting_entries_branch_fk FOREIGN KEY(clinic_id,branch_id) REFERENCES branches(clinic_id,id),
 CONSTRAINT waiting_entries_customer_fk FOREIGN KEY(clinic_id,customer_id) REFERENCES customers(clinic_id,id),
 CONSTRAINT waiting_entries_service_fk FOREIGN KEY(clinic_id,service_id) REFERENCES services(clinic_id,id),
 CONSTRAINT waiting_entries_employee_fk FOREIGN KEY(clinic_id,preferred_employee_id) REFERENCES users(clinic_id,id),
 CONSTRAINT waiting_entries_creator_fk FOREIGN KEY(clinic_id,created_by) REFERENCES users(clinic_id,id),
 CONSTRAINT waiting_entries_window_check CHECK(window_end>window_start), CONSTRAINT waiting_entries_version_check CHECK(version>0)
);
--> statement-breakpoint
CREATE INDEX waiting_entries_queue_idx ON waiting_list_entries(clinic_id,branch_id,service_id,status,created_at,id);
--> statement-breakpoint
CREATE TABLE waiting_list_offers (
 id serial PRIMARY KEY, clinic_id integer NOT NULL, entry_id integer NOT NULL, cancelled_appointment_id integer NOT NULL,
 cancellation_version integer NOT NULL, entry_version integer NOT NULL, status waiting_offer_status NOT NULL DEFAULT 'offered',
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, employee_id integer NOT NULL, replacement_appointment_id integer,
 created_by integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz,
 CONSTRAINT waiting_offers_clinic_id_unique UNIQUE(clinic_id,id),
 CONSTRAINT waiting_offers_entry_fk FOREIGN KEY(clinic_id,entry_id) REFERENCES waiting_list_entries(clinic_id,id),
 CONSTRAINT waiting_offers_cancelled_fk FOREIGN KEY(clinic_id,cancelled_appointment_id) REFERENCES appointments(clinic_id,id),
 CONSTRAINT waiting_offers_replacement_fk FOREIGN KEY(clinic_id,replacement_appointment_id) REFERENCES appointments(clinic_id,id),
 CONSTRAINT waiting_offers_employee_fk FOREIGN KEY(clinic_id,employee_id) REFERENCES users(clinic_id,id),
 CONSTRAINT waiting_offers_creator_fk FOREIGN KEY(clinic_id,created_by) REFERENCES users(clinic_id,id),
 CONSTRAINT waiting_offers_time_check CHECK(ends_at>starts_at),
 CONSTRAINT waiting_offers_booked_check CHECK((status='booked')=(replacement_appointment_id IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX waiting_offers_one_active_entry ON waiting_list_offers(clinic_id,entry_id) WHERE status='offered';
--> statement-breakpoint
CREATE UNIQUE INDEX waiting_offers_one_replacement ON waiting_list_offers(clinic_id,cancelled_appointment_id) WHERE status in ('offered','booked');
--> statement-breakpoint
CREATE INDEX waiting_offers_history_idx ON waiting_list_offers(clinic_id,cancelled_appointment_id,id);
--> statement-breakpoint
CREATE TABLE inventory_items (
 id serial PRIMARY KEY, clinic_id integer NOT NULL, branch_id integer NOT NULL, name text NOT NULL,
 name_lang language NOT NULL DEFAULT 'en', unit inventory_unit NOT NULL, created_by integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT inventory_items_clinic_id_unique UNIQUE(clinic_id,id),
 CONSTRAINT inventory_items_branch_unit_unique UNIQUE(clinic_id,branch_id,id,unit),
 CONSTRAINT inventory_items_branch_fk FOREIGN KEY(clinic_id,branch_id) REFERENCES branches(clinic_id,id),
 CONSTRAINT inventory_items_creator_fk FOREIGN KEY(clinic_id,created_by) REFERENCES users(clinic_id,id)
);
--> statement-breakpoint
CREATE INDEX inventory_items_branch_idx ON inventory_items(clinic_id,branch_id,name);
--> statement-breakpoint
CREATE TABLE inventory_consumptions (
 id serial PRIMARY KEY, clinic_id integer NOT NULL, branch_id integer NOT NULL, appointment_id integer NOT NULL, service_id integer NOT NULL,
 actor_id integer NOT NULL, payload_hash text NOT NULL, line_count integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT inventory_consumptions_appointment_unique UNIQUE(clinic_id,appointment_id),
 CONSTRAINT inventory_consumptions_context_unique UNIQUE(clinic_id,branch_id,id,appointment_id,service_id),
 CONSTRAINT inventory_consumptions_branch_fk FOREIGN KEY(clinic_id,branch_id) REFERENCES branches(clinic_id,id),
 CONSTRAINT inventory_consumptions_appointment_fk FOREIGN KEY(clinic_id,appointment_id) REFERENCES appointments(clinic_id,id),
 CONSTRAINT inventory_consumptions_service_fk FOREIGN KEY(clinic_id,service_id) REFERENCES services(clinic_id,id),
 CONSTRAINT inventory_consumptions_actor_fk FOREIGN KEY(clinic_id,actor_id) REFERENCES users(clinic_id,id),
 CONSTRAINT inventory_consumptions_lines_check CHECK(line_count BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE inventory_movements (
 id serial PRIMARY KEY, clinic_id integer NOT NULL, branch_id integer NOT NULL, item_id integer NOT NULL, unit inventory_unit NOT NULL,
 kind inventory_movement_kind NOT NULL, quantity numeric(16,3) NOT NULL, actor_id integer NOT NULL, reason text NOT NULL DEFAULT '',
 reason_lang language NOT NULL DEFAULT 'en', consumption_id integer, appointment_id integer, service_id integer, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT inventory_movements_consumption_item_unique UNIQUE(consumption_id,item_id),
 CONSTRAINT inventory_movements_item_unit_fk FOREIGN KEY(clinic_id,branch_id,item_id,unit) REFERENCES inventory_items(clinic_id,branch_id,id,unit),
 CONSTRAINT inventory_movements_actor_fk FOREIGN KEY(clinic_id,actor_id) REFERENCES users(clinic_id,id),
 CONSTRAINT inventory_movements_consumption_fk FOREIGN KEY(clinic_id,branch_id,consumption_id,appointment_id,service_id) REFERENCES inventory_consumptions(clinic_id,branch_id,id,appointment_id,service_id),
 CONSTRAINT inventory_movements_kind_check CHECK((kind='receipt' AND quantity>0 OR kind='adjustment' AND quantity<>0 OR kind='consumption' AND quantity<0) AND quantity<>'NaN'::numeric),
 CONSTRAINT inventory_movements_context_check CHECK((kind='consumption' AND consumption_id IS NOT NULL AND appointment_id IS NOT NULL AND service_id IS NOT NULL) OR (kind<>'consumption' AND consumption_id IS NULL AND appointment_id IS NULL AND service_id IS NULL)),
 CONSTRAINT inventory_movements_reason_check CHECK(kind<>'adjustment' OR length(trim(reason))>0)
);
--> statement-breakpoint
CREATE INDEX inventory_movements_item_idx ON inventory_movements(clinic_id,item_id,id);
--> statement-breakpoint
CREATE INDEX inventory_movements_service_idx ON inventory_movements(clinic_id,service_id,item_id);
--> statement-breakpoint
-- Guards are required in addition to Drizzle table declarations. Never disable on application paths.
CREATE OR REPLACE FUNCTION public.jormall_inventory_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Inventory records are append-only; record a new adjustment instead.' USING ERRCODE='55000';
END; $$;
DROP TRIGGER IF EXISTS inventory_movements_immutable ON public.inventory_movements;
CREATE TRIGGER inventory_movements_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.inventory_movements FOR EACH STATEMENT EXECUTE FUNCTION public.jormall_inventory_immutable();
DROP TRIGGER IF EXISTS inventory_consumptions_immutable ON public.inventory_consumptions;
CREATE TRIGGER inventory_consumptions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.inventory_consumptions FOR EACH STATEMENT EXECUTE FUNCTION public.jormall_inventory_immutable();

CREATE OR REPLACE FUNCTION public.jormall_inventory_item_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.clinic_id,NEW.branch_id,NEW.unit) IS DISTINCT FROM (OLD.id,OLD.clinic_id,OLD.branch_id,OLD.unit) THEN
    RAISE EXCEPTION 'Item identity, branch and unit cannot change.' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS inventory_items_identity_guard ON public.inventory_items;
CREATE TRIGGER inventory_items_identity_guard BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.jormall_inventory_item_identity();

CREATE OR REPLACE FUNCTION public.jormall_inventory_consumption_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a public.appointments%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(7140002,NEW.clinic_id);
  SELECT * INTO a FROM public.appointments WHERE clinic_id=NEW.clinic_id AND id=NEW.appointment_id FOR UPDATE;
  IF NOT FOUND OR a.status <> 'completed' OR a.branch_id <> NEW.branch_id OR a.service_id <> NEW.service_id THEN
    RAISE EXCEPTION 'Actual consumption must match a completed appointment.' USING ERRCODE='23514', CONSTRAINT='inventory_consumption_context_guard';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS inventory_consumptions_context_guard ON public.inventory_consumptions;
CREATE TRIGGER inventory_consumptions_context_guard BEFORE INSERT ON public.inventory_consumptions FOR EACH ROW EXECUTE FUNCTION public.jormall_inventory_consumption_guard();

CREATE OR REPLACE FUNCTION public.jormall_inventory_movement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item public.inventory_items%ROWTYPE; balance numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(7140002,NEW.clinic_id);
  SELECT * INTO item FROM public.inventory_items WHERE clinic_id=NEW.clinic_id AND id=NEW.item_id FOR UPDATE;
  IF NOT FOUND OR item.branch_id <> NEW.branch_id OR item.unit <> NEW.unit THEN
    RAISE EXCEPTION 'Inventory item context mismatch.' USING ERRCODE='23503';
  END IF;
  SELECT coalesce(sum(quantity),0) INTO balance FROM public.inventory_movements WHERE clinic_id=NEW.clinic_id AND item_id=NEW.item_id;
  IF balance+NEW.quantity < 0 THEN
    RAISE EXCEPTION 'Insufficient stock.' USING ERRCODE='23514', CONSTRAINT='inventory_nonnegative_guard';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS inventory_movements_insert_guard ON public.inventory_movements;
CREATE TRIGGER inventory_movements_insert_guard BEFORE INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.jormall_inventory_movement_guard();

-- Deferred count verification permits atomic multi-line inserts but never a later extra deduction.
CREATE OR REPLACE FUNCTION public.jormall_inventory_lines_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE record_id integer; expected integer; actual integer;
BEGIN
  IF TG_TABLE_NAME='inventory_consumptions' THEN record_id := NEW.id;
  ELSE record_id := NEW.consumption_id; END IF;
  IF record_id IS NULL THEN RETURN NULL; END IF;
  SELECT line_count INTO expected FROM public.inventory_consumptions WHERE clinic_id=NEW.clinic_id AND id=record_id;
  SELECT count(*) INTO actual FROM public.inventory_movements WHERE clinic_id=NEW.clinic_id AND consumption_id=record_id;
  IF expected IS NULL OR expected <> actual THEN
    RAISE EXCEPTION 'Consumption line count is locked.' USING ERRCODE='23514', CONSTRAINT='inventory_consumption_lines_guard';
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS inventory_movements_lines_guard ON public.inventory_movements;
CREATE CONSTRAINT TRIGGER inventory_movements_lines_guard AFTER INSERT ON public.inventory_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.jormall_inventory_lines_guard();
DROP TRIGGER IF EXISTS inventory_consumptions_lines_guard ON public.inventory_consumptions;
CREATE CONSTRAINT TRIGGER inventory_consumptions_lines_guard AFTER INSERT ON public.inventory_consumptions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.jormall_inventory_lines_guard();
