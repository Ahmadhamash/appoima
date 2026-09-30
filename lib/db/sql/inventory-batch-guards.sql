-- Each movement receives an immutable batch allocation. FEFO applies within its location.
-- The push wrapper can encounter existing stock before the first batch migration.
DO $$ DECLARE row record; batch integer; BEGIN
 FOR row IN SELECT i.clinic_id,i.branch_id,i.id AS item_id,m.room_id,sum(m.quantity) AS quantity,nullif(i.extra->>'expiryDate','')::date AS expiry_date
 FROM inventory_items i JOIN inventory_movements m ON m.clinic_id=i.clinic_id AND m.item_id=i.id
 WHERE NOT EXISTS(SELECT 1 FROM inventory_batch_allocations a WHERE a.clinic_id=i.clinic_id AND a.item_id=i.id AND a.room_id IS NOT DISTINCT FROM m.room_id)
 GROUP BY i.clinic_id,i.branch_id,i.id,m.room_id HAVING sum(m.quantity)>0 LOOP
  INSERT INTO inventory_batches(clinic_id,expiry_date) VALUES(row.clinic_id,row.expiry_date) RETURNING id INTO batch;
  INSERT INTO inventory_batch_allocations(clinic_id,branch_id,item_id,room_id,batch_id,quantity) VALUES(row.clinic_id,row.branch_id,row.item_id,row.room_id,batch,row.quantity);
 END LOOP;
END; $$;
CREATE OR REPLACE FUNCTION public.jormall_inventory_batch_allocate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE remaining numeric; portion numeric; batch integer; row record; transfer public.inventory_transfers%ROWTYPE; source_movement integer;
BEGIN
 PERFORM pg_advisory_xact_lock(7140002,NEW.clinic_id);
 IF NEW.transfer_id IS NOT NULL THEN
  SELECT * INTO transfer FROM inventory_transfers WHERE id=NEW.transfer_id AND clinic_id=NEW.clinic_id;
  IF NOT FOUND OR abs(NEW.quantity)<>transfer.quantity OR
   (NEW.quantity<0 AND (NEW.item_id<>transfer.from_item_id OR NEW.room_id IS DISTINCT FROM transfer.from_room_id)) OR
   (NEW.quantity>0 AND (NEW.item_id<>transfer.to_item_id OR NEW.room_id IS DISTINCT FROM transfer.to_room_id)) THEN
   RAISE EXCEPTION 'Invalid batch transfer context' USING ERRCODE='23514',CONSTRAINT='inventory_batch_transfer_context';
  END IF;
 END IF;
 IF NEW.quantity<0 THEN
  remaining := -NEW.quantity;
  FOR row IN SELECT b.id,b.expiry_date,sum(a.quantity) AS balance FROM inventory_batch_allocations a JOIN inventory_batches b ON b.clinic_id=a.clinic_id AND b.id=a.batch_id
   WHERE a.clinic_id=NEW.clinic_id AND a.item_id=NEW.item_id AND a.room_id IS NOT DISTINCT FROM NEW.room_id
   GROUP BY b.id,b.expiry_date HAVING sum(a.quantity)>0 ORDER BY b.expiry_date ASC NULLS LAST,b.id ASC
  LOOP
   portion := least(remaining,row.balance);
   INSERT INTO inventory_batch_allocations(clinic_id,branch_id,item_id,room_id,batch_id,movement_id,quantity) VALUES(NEW.clinic_id,NEW.branch_id,NEW.item_id,NEW.room_id,row.id,NEW.id,-portion);
   remaining := remaining-portion; EXIT WHEN remaining=0;
  END LOOP;
  IF remaining<>0 THEN RAISE EXCEPTION 'Insufficient batch stock' USING ERRCODE='23514',CONSTRAINT='inventory_nonnegative_guard'; END IF;
 ELSIF NEW.transfer_id IS NOT NULL THEN
  SELECT id INTO source_movement FROM inventory_movements WHERE clinic_id=NEW.clinic_id AND transfer_id=NEW.transfer_id AND quantity<0;
  IF source_movement IS NULL OR (SELECT coalesce(-sum(quantity),0) FROM inventory_batch_allocations WHERE movement_id=source_movement)<>NEW.quantity THEN
   RAISE EXCEPTION 'Batch transfer source must be allocated first' USING ERRCODE='23514';
  END IF;
  INSERT INTO inventory_batch_allocations(clinic_id,branch_id,item_id,room_id,batch_id,movement_id,quantity)
   SELECT NEW.clinic_id,NEW.branch_id,NEW.item_id,NEW.room_id,batch_id,NEW.id,-quantity FROM inventory_batch_allocations WHERE movement_id=source_movement;
 ELSE
  INSERT INTO inventory_batches(clinic_id,expiry_date) VALUES(NEW.clinic_id,NEW.batch_expiry_date) RETURNING id INTO batch;
  INSERT INTO inventory_batch_allocations(clinic_id,branch_id,item_id,room_id,batch_id,movement_id,quantity) VALUES(NEW.clinic_id,NEW.branch_id,NEW.item_id,NEW.room_id,batch,NEW.id,NEW.quantity);
 END IF;
 RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS inventory_movements_batch_allocate ON inventory_movements;
CREATE TRIGGER inventory_movements_batch_allocate AFTER INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION public.jormall_inventory_batch_allocate();
DROP TRIGGER IF EXISTS inventory_batches_immutable ON inventory_batches;
CREATE TRIGGER inventory_batches_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON inventory_batches FOR EACH STATEMENT EXECUTE FUNCTION public.jormall_inventory_immutable();
DROP TRIGGER IF EXISTS inventory_batch_allocations_immutable ON inventory_batch_allocations;
CREATE TRIGGER inventory_batch_allocations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON inventory_batch_allocations FOR EACH STATEMENT EXECUTE FUNCTION public.jormall_inventory_immutable();
