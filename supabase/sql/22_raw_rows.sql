-- Unified Raw Data Table (WMS/SAP)
-- Stores all ingested rows from Google Sheets with denormalized key fields

CREATE TABLE IF NOT EXISTS public.raw_rows (
  id BIGSERIAL PRIMARY KEY,
  warehouse_code TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES public.sheet_sources(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('wms', 'sap')),
  
  -- Store original header and row data
  header JSONB NOT NULL,  -- Header array at fetch time (for audit/debugging)
  row JSONB NOT NULL,     -- Original normalized row data
  
  -- Denormalized key fields for querying/aggregation
  zone TEXT,              -- WMS only
  location TEXT,          -- WMS only  
  item_code TEXT,
  lot_key TEXT,           -- Combined lot numbers (e.g., "LOT001|PROD002")
  split_key TEXT,         -- Split column value (e.g., Plant, Division, Building)
  
  -- Quantity fields
  available_qty NUMERIC,
  total_qty NUMERIC,
  
  -- SAP stock status quantities
  unrestricted_qty NUMERIC,       -- SAP Unrestricted stock
  quality_inspection_qty NUMERIC, -- SAP QI stock
  blocked_qty NUMERIC,            -- SAP Blocked stock
  returns_qty NUMERIC,            -- SAP Returns stock
  
  -- SAP source location
  source_location TEXT,   -- SAP source storage location
  
  -- Date fields
  inb_date DATE,
  valid_date DATE,
  prod_date DATE,
  
  -- Metadata
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id UUID          -- Optional: group rows from same ingest operation
);

-- Indexes for common queries
CREATE INDEX idx_raw_rows_warehouse_type 
  ON public.raw_rows(warehouse_code, source_type);
  
CREATE INDEX idx_raw_rows_item 
  ON public.raw_rows(warehouse_code, item_code);
  
CREATE INDEX idx_raw_rows_zone_location 
  ON public.raw_rows(warehouse_code, zone, location) 
  WHERE source_type = 'wms';

CREATE INDEX idx_raw_rows_split_key 
  ON public.raw_rows(warehouse_code, split_key) 
  WHERE source_type = 'sap' AND split_key IS NOT NULL;

CREATE INDEX idx_raw_rows_fetched_at 
  ON public.raw_rows(fetched_at DESC);

CREATE INDEX idx_raw_rows_batch_id 
  ON public.raw_rows(batch_id) 
  WHERE batch_id IS NOT NULL;

-- Unique index for upsert key (expressions not allowed in table-level UNIQUE)
CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_rows_composite
  ON public.raw_rows (
    warehouse_code,
    source_id,
    item_code,
    COALESCE(zone, ''),
    COALESCE(location, ''),
    COALESCE(lot_key, ''),
    COALESCE(split_key, ''),
    fetched_at
  );

-- Enable RLS (optional - may want to keep raw data more restricted)
ALTER TABLE public.raw_rows ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "raw_rows_read_all" 
  ON public.raw_rows FOR SELECT 
  USING (true);

-- Only service role can insert/update/delete raw rows
-- (Frontend should not directly manipulate raw data)

-- Function to get latest raw data for a warehouse
CREATE OR REPLACE FUNCTION get_latest_raw_data(
  p_warehouse_code TEXT,
  p_source_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 1000
)
RETURNS TABLE (
  id BIGINT,
  source_type TEXT,
  item_code TEXT,
  zone TEXT,
  location TEXT,
  lot_key TEXT,
  split_key TEXT,
  available_qty NUMERIC,
  total_qty NUMERIC,
  unrestricted_qty NUMERIC,
  quality_inspection_qty NUMERIC,
  blocked_qty NUMERIC,
  returns_qty NUMERIC,
  source_location TEXT,
  fetched_at TIMESTAMPTZ,
  row_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.source_type,
    r.item_code,
    r.zone,
    r.location,
    r.lot_key,
    r.split_key,
    r.available_qty,
    r.total_qty,
    r.unrestricted_qty,
    r.quality_inspection_qty,
    r.blocked_qty,
    r.returns_qty,
    r.source_location,
    r.fetched_at,
    r.row AS row_data
  FROM public.raw_rows r
  WHERE r.warehouse_code = p_warehouse_code
    AND (p_source_type IS NULL OR r.source_type = p_source_type)
  ORDER BY r.fetched_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to aggregate raw data for snapshot building (stub for now)
CREATE OR REPLACE FUNCTION build_snapshot_from_raw(
  p_warehouse_code TEXT,
  p_as_of TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB AS $$
DECLARE
  v_snapshot JSONB;
BEGIN
  -- TODO: Implement snapshot building logic
  -- For now, return a stub structure
  v_snapshot := jsonb_build_object(
    'warehouse_code', p_warehouse_code,
    'generated_at', p_as_of,
    'summary', jsonb_build_object(
      'total_items', (
        SELECT COUNT(DISTINCT item_code) 
        FROM public.raw_rows 
        WHERE warehouse_code = p_warehouse_code
          AND fetched_at <= p_as_of
      ),
      'total_zones', (
        SELECT COUNT(DISTINCT zone) 
        FROM public.raw_rows 
        WHERE warehouse_code = p_warehouse_code
          AND source_type = 'wms'
          AND zone IS NOT NULL
          AND fetched_at <= p_as_of
      )
    ),
    'status', 'stub'
  );
  
  RETURN v_snapshot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
