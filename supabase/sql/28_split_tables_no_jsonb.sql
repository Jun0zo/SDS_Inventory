-- Split raw_rows into wms_raw_rows and sap_raw_rows
-- Core columns stored directly for fast queries
-- All original columns stored in extra_columns JSONB for flexibility
-- This is a hybrid approach: speed + flexibility

-- ============================================
-- 1. Create WMS Raw Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.wms_raw_rows (
  id BIGSERIAL PRIMARY KEY,
  warehouse_code TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES public.sheet_sources(id) ON DELETE CASCADE,
  
  -- WMS location fields
  zone TEXT,
  location TEXT,
  
  -- Item identification
  item_code TEXT NOT NULL,
  lot_key TEXT,
  split_key TEXT,
  
  -- WMS specific field
  uld TEXT,  -- Unit Load Device (pallet, container, etc.)
  
  -- Quantities
  available_qty NUMERIC,
  total_qty NUMERIC,
  
  -- Dates
  inb_date DATE,
  valid_date DATE,
  prod_date DATE,
  
  -- ALL original Google Sheet columns (everything from the sheet)
  extra_columns JSONB DEFAULT '{}'::JSONB,
  
  -- Metadata
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id UUID,
  
  -- Unique constraint for upsert
  CONSTRAINT uq_wms_row UNIQUE (
    warehouse_code,
    source_id,
    COALESCE(zone, ''),
    COALESCE(location, ''),
    item_code,
    COALESCE(lot_key, ''),
    COALESCE(split_key, ''),
    fetched_at
  )
);

-- ============================================
-- 2. Create SAP Raw Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.sap_raw_rows (
  id BIGSERIAL PRIMARY KEY,
  warehouse_code TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES public.sheet_sources(id) ON DELETE CASCADE,
  
  -- Item identification
  item_code TEXT NOT NULL,
  lot_key TEXT,
  split_key TEXT,
  
  -- SAP fields
  source_location TEXT,
  
  -- SAP stock status quantities (Unrestricted, Quality Inspection, Blocked, Returns)
  unrestricted_qty NUMERIC,
  quality_inspection_qty NUMERIC,
  blocked_qty NUMERIC,
  returns_qty NUMERIC,
  
  -- Dates
  inb_date DATE,
  valid_date DATE,
  prod_date DATE,
  
  -- ALL original Google Sheet columns (everything from the sheet)
  extra_columns JSONB DEFAULT '{}'::JSONB,
  
  -- Metadata
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id UUID,
  
  -- Unique constraint for upsert
  CONSTRAINT uq_sap_row UNIQUE (
    warehouse_code,
    source_id,
    item_code,
    COALESCE(lot_key, ''),
    COALESCE(split_key, ''),
    COALESCE(source_location, ''),
    fetched_at
  )
);

-- ============================================
-- 3. Create Indexes for Fast Queries
-- ============================================

-- WMS Indexes
CREATE INDEX idx_wms_warehouse_source ON public.wms_raw_rows(warehouse_code, source_id);
CREATE INDEX idx_wms_zone_location ON public.wms_raw_rows(warehouse_code, zone, location) WHERE zone IS NOT NULL;
CREATE INDEX idx_wms_item ON public.wms_raw_rows(warehouse_code, item_code);
CREATE INDEX idx_wms_uld ON public.wms_raw_rows(warehouse_code, uld) WHERE uld IS NOT NULL;
CREATE INDEX idx_wms_split ON public.wms_raw_rows(warehouse_code, split_key) WHERE split_key IS NOT NULL;
CREATE INDEX idx_wms_fetched ON public.wms_raw_rows(fetched_at DESC);

-- SAP Indexes
CREATE INDEX idx_sap_warehouse_source ON public.sap_raw_rows(warehouse_code, source_id);
CREATE INDEX idx_sap_item ON public.sap_raw_rows(warehouse_code, item_code);
CREATE INDEX idx_sap_location ON public.sap_raw_rows(warehouse_code, source_location) WHERE source_location IS NOT NULL;
CREATE INDEX idx_sap_split ON public.sap_raw_rows(warehouse_code, split_key) WHERE split_key IS NOT NULL;
CREATE INDEX idx_sap_fetched ON public.sap_raw_rows(fetched_at DESC);

-- ============================================
-- 4. Migrate Existing Data (if raw_rows exists)
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'raw_rows') THEN
    -- Migrate WMS data
    INSERT INTO public.wms_raw_rows (
      warehouse_code, source_id, zone, location, item_code, lot_key, split_key,
      uld, available_qty, total_qty, inb_date, valid_date, prod_date, 
      extra_columns, fetched_at, batch_id
    )
    SELECT 
      warehouse_code, source_id, zone, location, item_code, lot_key, split_key,
      COALESCE(row->>'ULD', row->>'Uld', row->>'uld') as uld,
      available_qty, total_qty, inb_date, valid_date, prod_date,
      row as extra_columns,  -- ✅ 모든 원본 Sheet 컬럼 저장!
      fetched_at, batch_id
    FROM public.raw_rows
    WHERE source_type = 'wms'
    ON CONFLICT (warehouse_code, source_id, COALESCE(zone, ''), COALESCE(location, ''), 
                 item_code, COALESCE(lot_key, ''), COALESCE(split_key, ''), fetched_at) 
    DO NOTHING;
    
    -- Migrate SAP data
    INSERT INTO public.sap_raw_rows (
      warehouse_code, source_id, item_code, lot_key, split_key, source_location,
      unrestricted_qty, quality_inspection_qty, blocked_qty, returns_qty,
      inb_date, valid_date, prod_date, fetched_at, batch_id
    )
    SELECT 
      warehouse_code, source_id, item_code, lot_key, split_key, source_location,
      unrestricted_qty, quality_inspection_qty, blocked_qty, returns_qty,
      inb_date, valid_date, prod_date, fetched_at, batch_id
    FROM public.raw_rows
    WHERE source_type = 'sap'
    ON CONFLICT (warehouse_code, source_id, item_code, COALESCE(lot_key, ''), 
                 COALESCE(split_key, ''), COALESCE(source_location, ''), fetched_at) 
    DO NOTHING;
    
    RAISE NOTICE 'Data migrated from raw_rows to wms_raw_rows and sap_raw_rows';
  END IF;
END $$;

-- ============================================
-- 5. Enable RLS
-- ============================================

ALTER TABLE public.wms_raw_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_raw_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wms_read_all" ON public.wms_raw_rows FOR SELECT USING (true);
CREATE POLICY "sap_read_all" ON public.sap_raw_rows FOR SELECT USING (true);

-- ============================================
-- 6. Analyze for Query Planner
-- ============================================

ANALYZE public.wms_raw_rows;
ANALYZE public.sap_raw_rows;

-- ============================================
-- 7. Comments
-- ============================================

COMMENT ON TABLE public.wms_raw_rows IS 
  'WMS inventory data - all columns stored directly (no JSONB)';

COMMENT ON TABLE public.sap_raw_rows IS 
  'SAP inventory data - all columns stored directly (no JSONB)';

COMMENT ON COLUMN public.wms_raw_rows.uld IS 
  'Unit Load Device (pallet, container, etc.) - extracted from source data';

COMMENT ON COLUMN public.sap_raw_rows.unrestricted_qty IS 
  'SAP Unrestricted stock (immediately available)';

-- ============================================
-- 8. Drop old raw_rows table (AFTER TESTING!)
-- ============================================

-- ⚠️ Uncomment below ONLY after verifying new tables work correctly:
-- DROP TABLE IF EXISTS public.raw_rows CASCADE;
-- RAISE NOTICE '✅ Old raw_rows table dropped';
