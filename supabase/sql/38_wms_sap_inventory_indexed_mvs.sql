-- WMS and SAP Inventory Indexed Materialized Views
-- Purpose: Enable server-side filtering for Inventory View page (eliminates 100k row loading)
-- Performance: Replaces client-side filtering with indexed server-side queries

-- ========================================
-- WMS Inventory Indexed MV
-- ========================================

DROP MATERIALIZED VIEW IF EXISTS public.wms_inventory_indexed_mv CASCADE;

CREATE MATERIALIZED VIEW public.wms_inventory_indexed_mv AS
SELECT
  id,
  warehouse_code,
  source_id,
  item_code,
  zone,
  location,
  uld_id,
  lot_key,
  available_qty,
  tot_qty,
  split_key,
  inb_date,
  valid_date,
  item_nm,
  production_lot_no,
  fetched_at,
  batch_id,
  -- Normalized search columns (lowercase for case-insensitive search)
  LOWER(TRIM(item_code)) AS item_code_normalized,
  LOWER(TRIM(zone)) AS zone_normalized,
  LOWER(TRIM(location)) AS location_normalized,
  LOWER(TRIM(COALESCE(lot_key, ''))) AS lot_key_normalized,
  LOWER(TRIM(COALESCE(uld_id, ''))) AS uld_normalized
FROM public.wms_raw_rows
WHERE warehouse_code IS NOT NULL;

-- Create UNIQUE index (required for REFRESH MATERIALIZED VIEW CONCURRENTLY)
CREATE UNIQUE INDEX idx_wms_indexed_id ON public.wms_inventory_indexed_mv(id);

-- Create comprehensive indexes for fast filtering
CREATE INDEX idx_wms_indexed_warehouse ON public.wms_inventory_indexed_mv(warehouse_code);
CREATE INDEX idx_wms_indexed_item_code ON public.wms_inventory_indexed_mv(item_code_normalized);
CREATE INDEX idx_wms_indexed_zone ON public.wms_inventory_indexed_mv(zone_normalized);
CREATE INDEX idx_wms_indexed_location ON public.wms_inventory_indexed_mv(location_normalized);
CREATE INDEX idx_wms_indexed_lot ON public.wms_inventory_indexed_mv(lot_key_normalized);
CREATE INDEX idx_wms_indexed_uld ON public.wms_inventory_indexed_mv(uld_normalized);

-- Composite index for common filter combinations
CREATE INDEX idx_wms_indexed_warehouse_item ON public.wms_inventory_indexed_mv(warehouse_code, item_code_normalized);
CREATE INDEX idx_wms_indexed_warehouse_zone ON public.wms_inventory_indexed_mv(warehouse_code, zone_normalized);

-- Grant permissions
GRANT SELECT ON public.wms_inventory_indexed_mv TO authenticated, anon;

COMMENT ON MATERIALIZED VIEW public.wms_inventory_indexed_mv IS
  'Indexed WMS inventory data for fast server-side filtering in Inventory View page.
   Includes normalized columns for case-insensitive search.
   Refresh this view after WMS data sync.';

-- ========================================
-- SAP Inventory Indexed MV
-- ========================================

DROP MATERIALIZED VIEW IF EXISTS public.sap_inventory_indexed_mv CASCADE;

CREATE MATERIALIZED VIEW public.sap_inventory_indexed_mv AS
SELECT
  id,
  warehouse_code,
  source_id,
  material AS item_code,
  storage_location AS location,
  batch AS lot_key,
  unrestricted,
  quality_inspection,
  blocked,
  returns,
  split_key,
  material_description,
  base_unit_of_measure AS unit,
  fetched_at,
  batch_id,
  -- Normalized search columns (lowercase for case-insensitive search)
  LOWER(TRIM(material)) AS item_code_normalized,
  LOWER(TRIM(storage_location)) AS location_normalized,
  LOWER(TRIM(COALESCE(batch, ''))) AS lot_key_normalized
FROM public.sap_raw_rows
WHERE warehouse_code IS NOT NULL;

-- Create UNIQUE index (required for REFRESH MATERIALIZED VIEW CONCURRENTLY)
CREATE UNIQUE INDEX idx_sap_indexed_id ON public.sap_inventory_indexed_mv(id);

-- Create comprehensive indexes for fast filtering
CREATE INDEX idx_sap_indexed_warehouse ON public.sap_inventory_indexed_mv(warehouse_code);
CREATE INDEX idx_sap_indexed_item_code ON public.sap_inventory_indexed_mv(item_code_normalized);
CREATE INDEX idx_sap_indexed_location ON public.sap_inventory_indexed_mv(location_normalized);
CREATE INDEX idx_sap_indexed_lot ON public.sap_inventory_indexed_mv(lot_key_normalized);

-- Composite index for common filter combinations
CREATE INDEX idx_sap_indexed_warehouse_item ON public.sap_inventory_indexed_mv(warehouse_code, item_code_normalized);
CREATE INDEX idx_sap_indexed_warehouse_location ON public.sap_inventory_indexed_mv(warehouse_code, location_normalized);

-- Grant permissions
GRANT SELECT ON public.sap_inventory_indexed_mv TO authenticated, anon;

COMMENT ON MATERIALIZED VIEW public.sap_inventory_indexed_mv IS
  'Indexed SAP inventory data for fast server-side filtering in Inventory View page.
   Includes normalized columns for case-insensitive search.
   Refresh this view after SAP data sync.';
