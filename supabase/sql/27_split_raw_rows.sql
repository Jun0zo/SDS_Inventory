-- Split raw_rows into wms_raw_rows and sap_raw_rows
-- ⚠️ ONLY run this if index optimization (26_optimize_raw_rows_indexes.sql) is not enough!

-- Create WMS table
CREATE TABLE IF NOT EXISTS public.wms_raw_rows (
  id BIGSERIAL PRIMARY KEY,
  warehouse_code TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES public.sheet_sources(id) ON DELETE CASCADE,
  
  -- WMS specific fields
  zone TEXT NOT NULL,
  location TEXT NOT NULL,
  item_code TEXT NOT NULL,
  lot_key TEXT,
  split_key TEXT,
  
  -- Quantities
  available_qty NUMERIC,
  total_qty NUMERIC,
  
  -- Dates
  inb_date DATE,
  valid_date DATE,
  prod_date DATE,
  
  -- Metadata
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id UUID
);

-- Create SAP table
CREATE TABLE IF NOT EXISTS public.sap_raw_rows (
  id BIGSERIAL PRIMARY KEY,
  warehouse_code TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES public.sheet_sources(id) ON DELETE CASCADE,
  
  -- SAP specific fields
  item_code TEXT NOT NULL,
  lot_key TEXT,
  split_key TEXT,
  source_location TEXT,
  
  -- SAP stock status quantities
  unrestricted_qty NUMERIC,
  quality_inspection_qty NUMERIC,
  blocked_qty NUMERIC,
  returns_qty NUMERIC,
  
  -- Dates
  inb_date DATE,
  valid_date DATE,
  prod_date DATE,
  
  -- Metadata
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id UUID
);

-- Migrate existing data
INSERT INTO public.wms_raw_rows 
SELECT 
  id, warehouse_code, source_id,
  zone, location, item_code, lot_key, split_key,
  available_qty, total_qty,
  inb_date, valid_date, prod_date,
  fetched_at, batch_id
FROM public.raw_rows
WHERE source_type = 'wms';

INSERT INTO public.sap_raw_rows
SELECT 
  id, warehouse_code, source_id,
  item_code, lot_key, split_key, source_location,
  unrestricted_qty, quality_inspection_qty, blocked_qty, returns_qty,
  inb_date, valid_date, prod_date,
  fetched_at, batch_id
FROM public.raw_rows
WHERE source_type = 'sap';

-- Create indexes
CREATE INDEX idx_wms_warehouse_zone ON public.wms_raw_rows(warehouse_code, zone);
CREATE INDEX idx_wms_item ON public.wms_raw_rows(warehouse_code, item_code);
CREATE INDEX idx_wms_location ON public.wms_raw_rows(warehouse_code, zone, location);

CREATE INDEX idx_sap_warehouse_item ON public.sap_raw_rows(warehouse_code, item_code);
CREATE INDEX idx_sap_split ON public.sap_raw_rows(warehouse_code, split_key);
CREATE INDEX idx_sap_source_location ON public.sap_raw_rows(warehouse_code, source_location);

-- Enable RLS
ALTER TABLE public.wms_raw_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_raw_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wms_read_all" ON public.wms_raw_rows FOR SELECT USING (true);
CREATE POLICY "sap_read_all" ON public.sap_raw_rows FOR SELECT USING (true);

-- Analyze for query planner
ANALYZE public.wms_raw_rows;
ANALYZE public.sap_raw_rows;

-- ⚠️ Uncomment below after verifying split tables work correctly:
-- DROP TABLE public.raw_rows CASCADE;

COMMENT ON TABLE public.wms_raw_rows IS 'WMS-specific raw inventory data (split from raw_rows)';
COMMENT ON TABLE public.sap_raw_rows IS 'SAP-specific raw inventory data (split from raw_rows)';
