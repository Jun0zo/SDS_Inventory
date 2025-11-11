-- Fix: Allow warehouse_code to be NULL for sources without split configuration
ALTER TABLE public.raw_rows 
  ALTER COLUMN warehouse_code DROP NOT NULL;

-- Update indexes to handle NULL warehouse_code
DROP INDEX IF EXISTS idx_raw_rows_warehouse_type;
DROP INDEX IF EXISTS idx_raw_rows_item;
DROP INDEX IF EXISTS idx_raw_rows_zone_location;
DROP INDEX IF EXISTS idx_raw_rows_split_key;

-- Recreate indexes with NULL-aware logic
CREATE INDEX idx_raw_rows_warehouse_type 
  ON public.raw_rows(warehouse_code, source_type);

CREATE INDEX idx_raw_rows_item 
  ON public.raw_rows(item_code, warehouse_code);

CREATE INDEX idx_raw_rows_zone_location 
  ON public.raw_rows(zone, location, warehouse_code) 
  WHERE source_type = 'wms';

CREATE INDEX idx_raw_rows_split_key 
  ON public.raw_rows(split_key) 
  WHERE split_key IS NOT NULL;

CREATE INDEX idx_raw_rows_source_id
  ON public.raw_rows(source_id, fetched_at DESC);
