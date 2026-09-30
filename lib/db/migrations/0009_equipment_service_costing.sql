CREATE TABLE equipment_assets (
  id serial PRIMARY KEY, clinic_id integer NOT NULL REFERENCES clinics(id), branch_id integer NOT NULL, room_id integer,
  name text NOT NULL, equipment_type text NOT NULL DEFAULT '', purchase_cost numeric(12,3) NOT NULL, residual_value numeric(12,3) NOT NULL DEFAULT 0,
  lifetime_uses integer NOT NULL, maintenance_per_use numeric(12,3) NOT NULL DEFAULT 0, operating_hourly_cost numeric(12,3) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT equipment_assets_context_unique UNIQUE (clinic_id, branch_id, id),
  FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id,id),
  FOREIGN KEY (clinic_id, branch_id, room_id) REFERENCES rooms(clinic_id,branch_id,id),
  CONSTRAINT equipment_assets_cost_check CHECK (purchase_cost >= 0 AND residual_value >= 0 AND residual_value <= purchase_cost AND lifetime_uses > 0 AND maintenance_per_use >= 0 AND operating_hourly_cost >= 0 AND purchase_cost <> 'NaN'::numeric AND residual_value <> 'NaN'::numeric AND maintenance_per_use <> 'NaN'::numeric AND operating_hourly_cost <> 'NaN'::numeric)
);
--> statement-breakpoint
CREATE TABLE equipment_operators (
  clinic_id integer NOT NULL, branch_id integer NOT NULL, equipment_id integer NOT NULL, employee_id integer NOT NULL,
  PRIMARY KEY (equipment_id,employee_id),
  FOREIGN KEY (clinic_id,branch_id,equipment_id) REFERENCES equipment_assets(clinic_id,branch_id,id) ON DELETE CASCADE,
  FOREIGN KEY (clinic_id,employee_id) REFERENCES users(clinic_id,id)
);
--> statement-breakpoint
CREATE TABLE employee_costs (
  clinic_id integer NOT NULL, employee_id integer NOT NULL, hourly_cost numeric(12,3) NOT NULL,
  PRIMARY KEY (clinic_id,employee_id), FOREIGN KEY (clinic_id,employee_id) REFERENCES users(clinic_id,id),
  CONSTRAINT employee_costs_nonnegative CHECK (hourly_cost >= 0 AND hourly_cost <> 'NaN'::numeric)
);
--> statement-breakpoint
CREATE TABLE room_costs (
  clinic_id integer NOT NULL, room_id integer NOT NULL, hourly_cost numeric(12,3) NOT NULL,
  PRIMARY KEY (clinic_id,room_id), FOREIGN KEY (clinic_id,room_id) REFERENCES rooms(clinic_id,id),
  CONSTRAINT room_costs_nonnegative CHECK (hourly_cost >= 0 AND hourly_cost <> 'NaN'::numeric)
);
--> statement-breakpoint
CREATE TABLE service_cost_profiles (
  clinic_id integer NOT NULL, service_id integer NOT NULL, branch_id integer NOT NULL, overhead numeric(12,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (clinic_id,service_id,branch_id),
  FOREIGN KEY (clinic_id,service_id) REFERENCES services(clinic_id,id), FOREIGN KEY (clinic_id,branch_id) REFERENCES branches(clinic_id,id),
  CONSTRAINT service_cost_profiles_nonnegative CHECK (overhead >= 0 AND overhead <> 'NaN'::numeric)
);
--> statement-breakpoint
CREATE TABLE service_material_costs (
  clinic_id integer NOT NULL, service_id integer NOT NULL, branch_id integer NOT NULL, item_id integer NOT NULL, quantity numeric(12,3) NOT NULL,
  PRIMARY KEY (clinic_id,service_id,branch_id,item_id),
  FOREIGN KEY (clinic_id,service_id,branch_id) REFERENCES service_cost_profiles(clinic_id,service_id,branch_id) ON DELETE CASCADE,
  FOREIGN KEY (clinic_id,branch_id,item_id) REFERENCES inventory_items(clinic_id,branch_id,id),
  CONSTRAINT service_material_costs_positive CHECK (quantity > 0 AND quantity <> 'NaN'::numeric)
);
--> statement-breakpoint
CREATE TABLE service_equipment_costs (
  clinic_id integer NOT NULL, service_id integer NOT NULL, branch_id integer NOT NULL, equipment_id integer NOT NULL, uses integer NOT NULL, minutes integer NOT NULL,
  PRIMARY KEY (clinic_id,service_id,branch_id,equipment_id),
  FOREIGN KEY (clinic_id,service_id,branch_id) REFERENCES service_cost_profiles(clinic_id,service_id,branch_id) ON DELETE CASCADE,
  FOREIGN KEY (clinic_id,branch_id,equipment_id) REFERENCES equipment_assets(clinic_id,branch_id,id),
  CONSTRAINT service_equipment_costs_positive CHECK (uses > 0 AND minutes >= 0)
);
--> statement-breakpoint
CREATE TABLE appointment_cost_snapshots (
  id serial PRIMARY KEY, clinic_id integer NOT NULL, appointment_id integer NOT NULL, created_by integer NOT NULL,
  request_hash text NOT NULL, breakdown jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_cost_snapshot_unique UNIQUE (clinic_id,appointment_id),
  FOREIGN KEY (clinic_id,appointment_id) REFERENCES appointments(clinic_id,id), FOREIGN KEY (clinic_id,created_by) REFERENCES users(clinic_id,id)
);
--> statement-breakpoint
CREATE TRIGGER appointment_cost_snapshots_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON appointment_cost_snapshots
FOR EACH STATEMENT EXECUTE FUNCTION jormall_inventory_immutable();
