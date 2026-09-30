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
 IF (NEW.id,NEW.clinic_id,NEW.branch_id,NEW.unit,NEW.product_id) IS DISTINCT FROM (OLD.id,OLD.clinic_id,OLD.branch_id,OLD.unit,OLD.product_id) THEN
  RAISE EXCEPTION 'Item identity, catalog, branch and unit cannot change.' USING ERRCODE='55000';
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
DECLARE item public.inventory_items%ROWTYPE; balance numeric; location_balance numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(7140002,NEW.clinic_id);
 SELECT * INTO item FROM inventory_items WHERE clinic_id=NEW.clinic_id AND id=NEW.item_id FOR UPDATE;
 IF NOT FOUND OR item.branch_id<>NEW.branch_id OR item.unit<>NEW.unit OR item.is_available<>1 THEN
  RAISE EXCEPTION 'Inventory item context mismatch.' USING ERRCODE='23503';
 END IF;
 IF NEW.room_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inventory_settings WHERE clinic_id=NEW.clinic_id AND movement_mode='room') THEN
  RAISE EXCEPTION 'Room inventory tracking is disabled.' USING ERRCODE='23514',CONSTRAINT='inventory_room_tracking_guard';
 END IF;
 SELECT coalesce(sum(quantity),0) INTO balance FROM inventory_movements WHERE clinic_id=NEW.clinic_id AND item_id=NEW.item_id;
 SELECT coalesce(sum(quantity),0) INTO location_balance FROM inventory_movements WHERE clinic_id=NEW.clinic_id AND item_id=NEW.item_id AND room_id IS NOT DISTINCT FROM NEW.room_id;
 IF balance+NEW.quantity<0 OR location_balance+NEW.quantity<0 THEN
  RAISE EXCEPTION 'Insufficient stock in this location.' USING ERRCODE='23514',CONSTRAINT='inventory_nonnegative_guard';
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
