CREATE TABLE inventory_products (
 id serial PRIMARY KEY, clinic_id integer NOT NULL REFERENCES clinics(id), name text NOT NULL, name_lang language NOT NULL DEFAULT 'en',
 unit inventory_unit NOT NULL, extra jsonb NOT NULL DEFAULT '{}', availability text NOT NULL DEFAULT 'selected', created_by integer NOT NULL,
 CONSTRAINT inventory_products_clinic_id_unique UNIQUE (clinic_id,id),
 CONSTRAINT inventory_products_unit_unique UNIQUE (clinic_id,id,unit),
 CONSTRAINT inventory_products_creator_fk FOREIGN KEY (clinic_id,created_by) REFERENCES users(clinic_id,id),
 CONSTRAINT inventory_products_availability_check CHECK (availability IN ('all','selected'))
);
--> statement-breakpoint
CREATE TABLE inventory_settings (
 clinic_id integer PRIMARY KEY REFERENCES clinics(id), movement_mode text NOT NULL DEFAULT 'branch', version integer NOT NULL DEFAULT 1,
 CONSTRAINT inventory_settings_mode_check CHECK (movement_mode IN ('branch','room')),
 CONSTRAINT inventory_settings_version_check CHECK (version>0)
);
--> statement-breakpoint
ALTER TABLE inventory_items ADD COLUMN product_id integer DEFAULT NULL, ADD COLUMN is_available integer NOT NULL DEFAULT 1;
--> statement-breakpoint
INSERT INTO inventory_products(id,clinic_id,name,name_lang,unit,extra,created_by) SELECT id,clinic_id,name,name_lang,unit,extra,created_by FROM inventory_items;
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('inventory_products','id'),coalesce((SELECT max(id) FROM inventory_products),1),(SELECT count(*)>0 FROM inventory_products));
--> statement-breakpoint
UPDATE inventory_items SET product_id=id;
--> statement-breakpoint
-- Combine identical existing branch records only when each has a different branch.
-- Different names, units or metadata remain distinct catalog items. Every legacy item ID and movement is preserved.
WITH identical AS (
 SELECT clinic_id,name,name_lang,unit,extra,min(id) AS product_id
 FROM inventory_items GROUP BY clinic_id,name,name_lang,unit,extra
 HAVING count(*)=count(DISTINCT branch_id)
)
UPDATE inventory_items i SET product_id=g.product_id FROM identical g
 WHERE i.clinic_id=g.clinic_id AND i.name=g.name AND i.name_lang=g.name_lang AND i.unit=g.unit AND i.extra=g.extra;
--> statement-breakpoint
DELETE FROM inventory_products p WHERE NOT EXISTS(SELECT 1 FROM inventory_items i WHERE i.clinic_id=p.clinic_id AND i.product_id=p.id);
--> statement-breakpoint
ALTER TABLE inventory_items ALTER COLUMN product_id SET NOT NULL,
 ADD CONSTRAINT inventory_items_product_fk FOREIGN KEY (clinic_id,product_id,unit) REFERENCES inventory_products(clinic_id,id,unit),
 ADD CONSTRAINT inventory_items_product_branch_unique UNIQUE (clinic_id,product_id,branch_id),
 ADD CONSTRAINT inventory_items_available_check CHECK (is_available IN (0,1));
--> statement-breakpoint
ALTER TABLE inventory_movements ADD COLUMN room_id integer,
 ADD CONSTRAINT inventory_movements_room_fk FOREIGN KEY (clinic_id,branch_id,room_id) REFERENCES rooms(clinic_id,branch_id,id);
--> statement-breakpoint
CREATE INDEX inventory_movements_location_idx ON inventory_movements(clinic_id,item_id,room_id);
--> statement-breakpoint
ALTER TABLE inventory_transfers ADD COLUMN from_room_id integer, ADD COLUMN to_room_id integer,
 DROP CONSTRAINT inventory_transfers_distinct_check,
 ADD CONSTRAINT inventory_transfers_distinct_check CHECK (from_item_id<>to_item_id OR from_room_id IS DISTINCT FROM to_room_id);
--> statement-breakpoint
-- Legacy writers and fixtures still create a valid clinic catalog entry automatically.
CREATE FUNCTION public.jormall_inventory_product_default() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.product_id IS NULL THEN
  INSERT INTO inventory_products(clinic_id,name,name_lang,unit,extra,created_by)
   VALUES(NEW.clinic_id,NEW.name,NEW.name_lang,NEW.unit,NEW.extra,NEW.created_by) RETURNING id INTO NEW.product_id;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER inventory_items_product_default BEFORE INSERT ON inventory_items FOR EACH ROW EXECUTE FUNCTION public.jormall_inventory_product_default();
--> statement-breakpoint
-- All-branch items automatically become available when a branch is added, with zero stock.
CREATE FUNCTION public.jormall_inventory_new_branch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(7140002,NEW.clinic_id);
 INSERT INTO inventory_items(clinic_id,branch_id,product_id,name,name_lang,unit,extra,created_by)
  SELECT clinic_id,NEW.id,id,name,name_lang,unit,extra,created_by FROM inventory_products WHERE clinic_id=NEW.clinic_id AND availability='all';
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER branches_inventory_catalog AFTER INSERT ON branches FOR EACH ROW EXECUTE FUNCTION public.jormall_inventory_new_branch();
--> statement-breakpoint
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.jormall_inventory_item_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.clinic_id,NEW.branch_id,NEW.unit,NEW.product_id) IS DISTINCT FROM (OLD.id,OLD.clinic_id,OLD.branch_id,OLD.unit,OLD.product_id) THEN
  RAISE EXCEPTION 'Item identity, catalog, branch and unit cannot change.' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END; $$;
