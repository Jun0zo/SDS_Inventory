-- Update lot_key generation for WMS rows to prioritize production_lot_no
-- Run this after updating the table schema

-- Temporarily drop the generated column constraint
ALTER TABLE public.wms_raw_rows DROP COLUMN IF EXISTS lot_key;

-- Re-add the column with new generation logic
ALTER TABLE public.wms_raw_rows
ADD COLUMN lot_key TEXT GENERATED ALWAYS AS (COALESCE(production_lot_no, lot_no)) STORED;

-- Update existing data (though generated columns should auto-calculate)
-- This ensures existing rows are updated
UPDATE public.wms_raw_rows
SET lot_no = lot_no
WHERE lot_no IS NOT NULL OR production_lot_no IS NOT NULL;

-- Analyze for query planner
ANALYZE public.wms_raw_rows;

COMMENT ON COLUMN public.wms_raw_rows.lot_key IS 'Lot key prioritizing production_lot_no over lot_no';