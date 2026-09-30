ALTER TABLE appointments ADD COLUMN product_charges jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE appointments ADD COLUMN product_charges_basis text NOT NULL DEFAULT 'planned';
--> statement-breakpoint
ALTER TABLE appointments ADD CONSTRAINT appointments_products_check CHECK (
  jsonb_typeof(product_charges) = 'array' AND jsonb_array_length(product_charges) <= 100
  AND product_charges_basis IN ('planned','actual','manual')
);
