-- Keep existing values and allow the clinic to name its own categories.
ALTER TABLE services ALTER COLUMN category TYPE text USING category::text;
ALTER TABLE services ADD CONSTRAINT services_category_label_check CHECK (char_length(btrim(category)) BETWEEN 1 AND 80);
