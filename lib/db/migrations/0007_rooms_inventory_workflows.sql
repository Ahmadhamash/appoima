ALTER TABLE public.rooms ADD COLUMN extra jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE public.inventory_items ADD COLUMN extra jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_clinic_branch_id_unique UNIQUE (clinic_id,branch_id,id);
--> statement-breakpoint
CREATE TABLE public.room_blocks (
 id serial PRIMARY KEY, clinic_id integer NOT NULL, branch_id integer NOT NULL, room_id integer NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 kind text NOT NULL, reason text NOT NULL, notes text NOT NULL DEFAULT '',
 created_by integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT room_blocks_room_fk FOREIGN KEY (clinic_id,branch_id,room_id) REFERENCES public.rooms(clinic_id,branch_id,id),
 CONSTRAINT room_blocks_creator_fk FOREIGN KEY (clinic_id,created_by) REFERENCES public.users(clinic_id,id),
 CONSTRAINT room_blocks_time_check CHECK (ends_at>starts_at),
 CONSTRAINT room_blocks_kind_check CHECK (kind IN ('maintenance','block'))
);
--> statement-breakpoint
CREATE INDEX room_blocks_room_time_idx ON public.room_blocks(clinic_id,room_id,starts_at);
--> statement-breakpoint
CREATE TABLE public.inventory_purchase_orders (
 id serial PRIMARY KEY, clinic_id integer NOT NULL, branch_id integer NOT NULL,
 supplier text NOT NULL, status text NOT NULL DEFAULT 'pending', notes text NOT NULL DEFAULT '',
 created_by integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), received_at timestamptz,
 CONSTRAINT inventory_purchase_orders_clinic_id_unique UNIQUE (clinic_id,id),
 CONSTRAINT inventory_purchase_orders_branch_id_unique UNIQUE (clinic_id,branch_id,id),
 CONSTRAINT inventory_purchase_orders_branch_fk FOREIGN KEY (clinic_id,branch_id) REFERENCES public.branches(clinic_id,id),
 CONSTRAINT inventory_purchase_orders_creator_fk FOREIGN KEY (clinic_id,created_by) REFERENCES public.users(clinic_id,id),
 CONSTRAINT inventory_purchase_orders_status_check CHECK (status IN ('pending','partial','received','cancelled'))
);
--> statement-breakpoint
CREATE INDEX inventory_purchase_orders_branch_idx ON public.inventory_purchase_orders(clinic_id,branch_id,created_at);
--> statement-breakpoint
CREATE TABLE public.inventory_purchase_order_lines (
 id serial PRIMARY KEY, clinic_id integer NOT NULL, branch_id integer NOT NULL,
 order_id integer NOT NULL, item_id integer NOT NULL,
 ordered_quantity numeric(16,3) NOT NULL, received_quantity numeric(16,3) NOT NULL DEFAULT 0,
 unit_cost numeric(16,3) NOT NULL DEFAULT 0,
 CONSTRAINT inventory_purchase_order_lines_item_unique UNIQUE (order_id,item_id),
 CONSTRAINT inventory_purchase_order_lines_order_fk FOREIGN KEY (clinic_id,branch_id,order_id) REFERENCES public.inventory_purchase_orders(clinic_id,branch_id,id),
 CONSTRAINT inventory_purchase_order_lines_item_fk FOREIGN KEY (clinic_id,branch_id,item_id) REFERENCES public.inventory_items(clinic_id,branch_id,id),
 CONSTRAINT inventory_purchase_order_lines_quantity_check CHECK (ordered_quantity>0 AND received_quantity>=0 AND received_quantity<=ordered_quantity AND unit_cost>=0)
);
--> statement-breakpoint
CREATE INDEX inventory_purchase_order_lines_order_idx ON public.inventory_purchase_order_lines(clinic_id,order_id);
--> statement-breakpoint
CREATE TABLE public.inventory_transfers (
 id serial PRIMARY KEY, clinic_id integer NOT NULL,
 from_item_id integer NOT NULL, to_item_id integer NOT NULL,
 quantity numeric(16,3) NOT NULL, notes text NOT NULL DEFAULT '',
 created_by integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT inventory_transfers_from_item_fk FOREIGN KEY (clinic_id,from_item_id) REFERENCES public.inventory_items(clinic_id,id),
 CONSTRAINT inventory_transfers_to_item_fk FOREIGN KEY (clinic_id,to_item_id) REFERENCES public.inventory_items(clinic_id,id),
 CONSTRAINT inventory_transfers_creator_fk FOREIGN KEY (clinic_id,created_by) REFERENCES public.users(clinic_id,id),
 CONSTRAINT inventory_transfers_quantity_check CHECK (quantity>0),
 CONSTRAINT inventory_transfers_distinct_check CHECK (from_item_id<>to_item_id)
);
--> statement-breakpoint
CREATE INDEX inventory_transfers_clinic_idx ON public.inventory_transfers(clinic_id,created_at);
