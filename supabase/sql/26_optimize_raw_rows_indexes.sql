-- Optimize raw_rows indexes for faster queries
-- Run this BEFORE considering table split

-- Drop existing generic indexes
DROP INDEX IF EXISTS idx_raw_rows_warehouse_type;
DROP INDEX IF EXISTS idx_raw_rows_zone_location;
DROP INDEX IF EXISTS idx_raw_rows_split_key;

-- Create type-specific partial indexes (더 효율적!)

-- WMS specific indexes (only for WMS rows)
CREATE INDEX idx_wms_zone_location 
  ON public.raw_rows(warehouse_code, zone, location) 
  WHERE source_type = 'wms' AND zone IS NOT NULL;

CREATE INDEX idx_wms_item 
  ON public.raw_rows(warehouse_code, item_code, zone) 
  WHERE source_type = 'wms';

-- SAP specific indexes (only for SAP rows)
CREATE INDEX idx_sap_item 
  ON public.raw_rows(warehouse_code, item_code, source_location) 
  WHERE source_type = 'sap';

CREATE INDEX idx_sap_split 
  ON public.raw_rows(warehouse_code, split_key) 
  WHERE source_type = 'sap' AND split_key IS NOT NULL;

-- Covering index for common queries (모든 필요 컬럼 포함)
CREATE INDEX idx_raw_rows_covering_wms
  ON public.raw_rows(warehouse_code, source_id, source_type, zone, location, item_code, available_qty)
  WHERE source_type = 'wms';

CREATE INDEX idx_raw_rows_covering_sap
  ON public.raw_rows(warehouse_code, source_id, source_type, item_code, unrestricted_qty, quality_inspection_qty)
  WHERE source_type = 'sap';

-- Analyze table for query planner
ANALYZE public.raw_rows;

COMMENT ON INDEX idx_wms_zone_location IS 
  'Optimized index for WMS zone/location queries (partial index)';

COMMENT ON INDEX idx_sap_item IS 
  'Optimized index for SAP item queries (partial index)';
