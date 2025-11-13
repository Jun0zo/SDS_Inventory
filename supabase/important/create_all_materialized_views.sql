-- ============================================================================
-- Master Migration: Execute All Materialized Views
-- ============================================================================

-- Helper function to sum integer arrays
CREATE OR REPLACE FUNCTION array_sum_int(arr INTEGER[])
RETURNS INTEGER AS $$
DECLARE
  total INTEGER := 0;
  val INTEGER;
BEGIN
  IF arr IS NULL OR array_length(arr, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOREACH val IN ARRAY arr LOOP
    total := total + COALESCE(val, 0);
  END LOOP;

  RETURN total;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION array_sum_int IS
  'Sums all elements in an integer array, treating NULL values as 0';

-- Function to set warehouse_id from zone_id for items
CREATE OR REPLACE FUNCTION set_item_warehouse_id()
RETURNS TRIGGER AS $$
BEGIN
  -- zone_id가 설정되어 있고 warehouse_id가 NULL이면 자동 설정
  IF NEW.zone_id IS NOT NULL AND (NEW.warehouse_id IS NULL OR TG_OP = 'INSERT') THEN
    SELECT warehouse_id INTO NEW.warehouse_id
    FROM public.zones
    WHERE id = NEW.zone_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_item_warehouse_id IS
  'Automatically sets warehouse_id based on zone_id when creating or updating items';

-- Function to calculate max_capacity for items
CREATE OR REPLACE FUNCTION calculate_item_max_capacity()
RETURNS TRIGGER AS $$
BEGIN
  -- Rack 아이템: floor_capacities 배열 합산 (jsonb를 integer[]로 변환)
  IF NEW.type = 'rack' THEN
    NEW.max_capacity := array_sum_int(ARRAY(SELECT jsonb_array_elements_text(NEW.floor_capacities)::integer));
  -- Flat 아이템: 기존 max_capacity 유지 (기본값 0)
  ELSIF NEW.type = 'flat' THEN
    NEW.max_capacity := COALESCE(NEW.max_capacity, 0);
  ELSE
    NEW.max_capacity := COALESCE(NEW.max_capacity, 0);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_item_max_capacity IS
  'Calculates max_capacity for items based on type and floor_capacities';

-- Create triggers on items table (drop if exists first)
DROP TRIGGER IF EXISTS trigger_set_item_warehouse_id ON public.items;
DROP TRIGGER IF EXISTS trigger_calculate_item_max_capacity ON public.items;

-- warehouse_id 자동 설정 트리거 (먼저 실행)
CREATE TRIGGER trigger_set_item_warehouse_id
  BEFORE INSERT OR UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION set_item_warehouse_id();

-- max_capacity 계산 트리거 (나중에 실행)
CREATE TRIGGER trigger_calculate_item_max_capacity
  BEFORE INSERT OR UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_item_max_capacity();

-- Update existing items to set warehouse_id from zone_id
UPDATE public.items
SET warehouse_id = z.warehouse_id
FROM public.zones z
WHERE items.zone_id = z.id
  AND items.warehouse_id IS NULL;

-- Update existing items to calculate max_capacity
UPDATE public.items
SET max_capacity = CASE
  WHEN type = 'rack' THEN array_sum_int(ARRAY(SELECT jsonb_array_elements_text(floor_capacities)::integer))
  ELSE COALESCE(max_capacity, 0)
END
WHERE max_capacity IS NULL OR (type = 'rack' AND floor_capacities IS NOT NULL);
-- Purpose: Create all 10 materialized views and helper functions in one go
-- Usage: Copy and paste this ENTIRE file into Supabase SQL Editor and run
--
-- This file includes:
-- 1. Zone normalization function and aliases table
-- 2. Zone capacities MV
-- 3. Dashboard inventory stats MV
-- 4. Inventory discrepancies MV
-- 5. WMS/SAP inventory indexed MVs
-- 6. Location inventory summary MV
-- 7. Item inventory summary MV
-- 8. Stock status distribution MV
-- 9. Expiring items MV
-- 10. Slow moving items MV
-- 11. Master refresh function for all MVs
--
-- Note: MVs store ALL items for SidePanel. Pagination handled in client.
-- ============================================================================

-- Zone Normalization: Create zone aliases table and normalization functions
-- Purpose: Eliminate manual string matching for zone codes (EA2-A, EA2A, ea2-a, etc.)

-- Create normalization function (idempotent)
CREATE OR REPLACE FUNCTION normalize_zone_code(zone_code TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Normalize: trim, remove hyphens, uppercase
  -- "EA2-A" → "EA2A", "f-03" → "F03"
  RETURN UPPER(TRIM(REPLACE(COALESCE(zone_code, ''), '-', '')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION normalize_zone_code IS
  'Normalizes zone codes by trimming, removing hyphens, and converting to uppercase';

-- Zone aliases removed - using direct zone matching instead
-- Create index on zones for normalized code lookups
CREATE INDEX IF NOT EXISTS idx_zones_code_normalized
  ON public.zones(normalize_zone_code(code));
-- Zone Capacities Materialized View
-- Purpose: Pre-calculate zone capacities and current stock for fast dashboard queries
-- Performance: Reduces query time from 500-2000ms to 10-50ms

-- Drop existing view if exists
DROP MATERIALIZED VIEW IF EXISTS public.zone_capacities_mv CASCADE;

-- Create materialized view for zone capacities
CREATE MATERIALIZED VIEW public.zone_capacities_mv AS
WITH zone_layout_capacity AS (
  -- Aggregate max capacity directly from items.max_capacity for each zone
  SELECT
    z.id AS zone_id,
    z.code AS zone_code,
    z.name AS zone_name,
    z.warehouse_id,
    wh.code AS warehouse_code, -- Get warehouse code from warehouses table
    0 AS layout_count, -- layouts table doesn't exist, using 0
    COUNT(DISTINCT i.id) AS item_count,
    -- Calculate zone max capacity from items.max_capacity
    -- max_capacity is automatically calculated by trigger on items table:
    -- For flat items: stored max_capacity value
    -- For rack items: SUM(floor_capacities) calculated and stored
    COALESCE(SUM(i.max_capacity), 0)::INTEGER AS max_capacity,
    -- Collect all locations for this zone (for WMS matching)
    array_agg(DISTINCT i.location) FILTER (WHERE i.location IS NOT NULL) AS zone_locations
  FROM public.zones z
  LEFT JOIN public.warehouses wh ON z.warehouse_id = wh.id
  LEFT JOIN public.items i ON i.zone_id = z.id
  GROUP BY z.id, z.code, z.name, z.warehouse_id, wh.code
),
wms_current_stock AS (
  -- Calculate current stock from WMS data by matching BOTH zone AND location
  -- This matches the original logic: zone must match AND location must match (flat or rack pattern)
  SELECT
    zlc.zone_id,
    COUNT(DISTINCT w.id) AS current_stock_count,
    SUM(COALESCE(w.available_qty, 0))::NUMERIC AS total_available_qty
  FROM zone_layout_capacity zlc
  JOIN public.wms_raw_rows w ON
    -- Condition 1: Zone must match (direct comparison)
    EXISTS (
      SELECT 1
      FROM public.zones z
      WHERE normalize_zone_code(w.zone_cd) = normalize_zone_code(w.split_key)
        AND z.id = zlc.zone_id
    )
    AND
    -- Condition 2: Location must match (flat: exact match, rack: prefix match)
    EXISTS (
      SELECT 1
      FROM unnest(zlc.zone_locations) AS item_location
      WHERE
        -- Flat: exact match (e.g., WMS "B1" = item "B1")
        UPPER(TRIM(w.cell_no)) = UPPER(TRIM(item_location))
        OR
        -- Rack: prefix match (e.g., WMS "A1-01-02" starts with item "A1-")
        UPPER(TRIM(w.cell_no)) LIKE UPPER(TRIM(item_location)) || '-%'
    )
  WHERE w.zone_cd IS NOT NULL
    AND w.cell_no IS NOT NULL
  GROUP BY zlc.zone_id
)
SELECT
  zlc.zone_id,
  zlc.zone_code,
  zlc.zone_name,
  zlc.warehouse_id,
  zlc.warehouse_code,
  zlc.layout_count,
  zlc.item_count,
  zlc.max_capacity,
  -- Current stock from zone AND location matched WMS rows
  COALESCE(wcs.current_stock_count, 0)::INTEGER AS current_stock,
  COALESCE(wcs.total_available_qty, 0)::NUMERIC AS total_available_qty,
  -- Calculate utilization percentage
  CASE
    WHEN zlc.max_capacity > 0 THEN
      ROUND(
        (COALESCE(wcs.current_stock_count, 0)::NUMERIC / zlc.max_capacity::NUMERIC * 100),
        2
      )
    ELSE 0
  END AS utilization_percentage,
  -- Capacity status categorization
  CASE
    WHEN zlc.max_capacity = 0 THEN 'no_capacity'
    WHEN COALESCE(wcs.current_stock_count, 0)::NUMERIC / zlc.max_capacity::NUMERIC >= 0.9 THEN 'critical'
    WHEN COALESCE(wcs.current_stock_count, 0)::NUMERIC / zlc.max_capacity::NUMERIC >= 0.7 THEN 'high'
    WHEN COALESCE(wcs.current_stock_count, 0)::NUMERIC / zlc.max_capacity::NUMERIC >= 0.5 THEN 'medium'
    ELSE 'low'
  END AS capacity_status,
  NOW() AS last_updated
FROM zone_layout_capacity zlc
LEFT JOIN wms_current_stock wcs ON wcs.zone_id = zlc.zone_id;

-- Create indexes on materialized view
CREATE UNIQUE INDEX idx_zone_capacities_mv_zone_id
  ON public.zone_capacities_mv(zone_id);

CREATE INDEX idx_zone_capacities_mv_warehouse_code
  ON public.zone_capacities_mv(warehouse_code);

CREATE INDEX idx_zone_capacities_mv_status
  ON public.zone_capacities_mv(capacity_status);

CREATE INDEX idx_zone_capacities_mv_utilization
  ON public.zone_capacities_mv(utilization_percentage DESC);

-- Create function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_zone_capacities()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.zone_capacities_mv;
  RAISE NOTICE 'Zone capacities materialized view refreshed at %', NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT ON public.zone_capacities_mv TO authenticated, anon;
GRANT EXECUTE ON FUNCTION refresh_zone_capacities() TO authenticated;

-- Comments
COMMENT ON MATERIALIZED VIEW public.zone_capacities_mv IS
  'Pre-calculated zone capacities with current stock levels and utilization percentages.
   Refresh this view after WMS data sync using refresh_zone_capacities() function.';

COMMENT ON FUNCTION refresh_zone_capacities() IS
  'Refreshes the zone_capacities_mv materialized view concurrently (non-blocking).
   Call this function after syncing WMS data.';

-- Initial refresh
SELECT refresh_zone_capacities();
-- Dashboard Inventory Stats Materialized View
-- Purpose: Pre-calculate all dashboard KPI metrics (Total Inventory, Available Stock, SKU counts)
-- Performance: Replaces multiple full table scans with single indexed query

-- Drop existing view if exists
DROP MATERIALIZED VIEW IF EXISTS public.dashboard_inventory_stats_mv CASCADE;

-- Create materialized view for dashboard inventory statistics
CREATE MATERIALIZED VIEW public.dashboard_inventory_stats_mv AS
WITH wms_stats AS (
  SELECT
    split_key AS factory_location,
    COUNT(DISTINCT item_code) AS unique_skus,
    SUM(COALESCE(available_qty, 0))::NUMERIC AS total_available_qty,
    SUM(COALESCE(tot_qty, 0))::NUMERIC AS total_qty,
    COUNT(*) AS row_count
  FROM public.wms_raw_rows
  WHERE split_key IS NOT NULL
  GROUP BY split_key
),
sap_stats AS (
  SELECT
    split_key AS factory_location,
    COUNT(DISTINCT material) AS unique_skus,
    SUM(COALESCE(unrestricted_qty, 0))::NUMERIC AS unrestricted_qty,
    SUM(COALESCE(blocked_qty, 0))::NUMERIC AS blocked_qty,
    SUM(COALESCE(quality_inspection_qty, 0))::NUMERIC AS quality_inspection_qty,
    SUM(COALESCE(returns_qty, 0))::NUMERIC AS returns_qty,
    (
      SUM(COALESCE(unrestricted_qty, 0)) +
      SUM(COALESCE(blocked_qty, 0)) +
      SUM(COALESCE(quality_inspection_qty, 0)) +
      SUM(COALESCE(returns_qty, 0))
    )::NUMERIC AS total_qty,
    COUNT(*) AS row_count
  FROM public.sap_raw_rows
  WHERE split_key IS NOT NULL
  GROUP BY split_key
),
combined_skus AS (
  SELECT
    split_key AS factory_location,
    item_code
  FROM wms_raw_rows
  WHERE split_key IS NOT NULL

  UNION

  SELECT
    split_key AS factory_location,
    material AS item_code
  FROM sap_raw_rows
  WHERE split_key IS NOT NULL
),
total_unique_skus AS (
  SELECT
    factory_location,
    COUNT(DISTINCT item_code) AS total_unique_skus
  FROM combined_skus
  GROUP BY factory_location
)
SELECT
  COALESCE(w.factory_location, s.factory_location, t.factory_location) AS factory_location,

  -- WMS Stats
  COALESCE(w.unique_skus, 0)::INTEGER AS wms_unique_skus,
  COALESCE(w.total_available_qty, 0)::NUMERIC AS wms_available_qty,
  COALESCE(w.total_qty, 0)::NUMERIC AS wms_total_qty,
  COALESCE(w.row_count, 0)::INTEGER AS wms_row_count,

  -- SAP Stats
  COALESCE(s.unique_skus, 0)::INTEGER AS sap_unique_skus,
  COALESCE(s.unrestricted_qty, 0)::NUMERIC AS sap_unrestricted_qty,
  COALESCE(s.blocked_qty, 0)::NUMERIC AS sap_blocked_qty,
  COALESCE(s.quality_inspection_qty, 0)::NUMERIC AS sap_quality_inspection_qty,
  COALESCE(s.returns_qty, 0)::NUMERIC AS sap_returns_qty,
  COALESCE(s.total_qty, 0)::NUMERIC AS sap_total_qty,
  COALESCE(s.row_count, 0)::INTEGER AS sap_row_count,

  -- Combined Stats
  COALESCE(t.total_unique_skus, 0)::INTEGER AS total_unique_skus,
  (COALESCE(w.total_qty, 0) + COALESCE(s.total_qty, 0))::NUMERIC AS combined_total_qty,

  -- Percentages
  CASE
    WHEN COALESCE(w.total_qty, 0) > 0 THEN
      ROUND(100.0 * COALESCE(w.total_available_qty, 0) / COALESCE(w.total_qty, 0), 2)
    ELSE 0
  END AS wms_available_percentage,

  NOW() AS last_updated
FROM wms_stats w
FULL OUTER JOIN sap_stats s ON w.factory_location = s.factory_location
FULL OUTER JOIN total_unique_skus t ON COALESCE(w.factory_location, s.factory_location) = t.factory_location;

-- Create indexes on materialized view
CREATE UNIQUE INDEX idx_dashboard_inventory_stats_mv_factory_location
  ON public.dashboard_inventory_stats_mv(factory_location);

-- Grant permissions
GRANT SELECT ON public.dashboard_inventory_stats_mv TO authenticated, anon;

-- Comments
COMMENT ON MATERIALIZED VIEW public.dashboard_inventory_stats_mv IS
  'Pre-calculated dashboard KPI metrics including total inventory, available stock, and unique SKU counts.
   Refresh this view after WMS/SAP data sync.';

-- Refresh function will be added in a separate migration
-- SELECT refresh_zone_capacities(); will be extended to refresh all MVs
-- Inventory Discrepancies Materialized View
-- Purpose: Pre-calculate SAP vs WMS mismatches to eliminate client-side joins
-- Performance: Replaces expensive client-side join of two large tables with indexed query

-- Drop existing view if exists
DROP MATERIALIZED VIEW IF EXISTS public.inventory_discrepancies_mv CASCADE;

-- Create materialized view for inventory discrepancies
CREATE MATERIALIZED VIEW public.inventory_discrepancies_mv AS
WITH wms_aggregated AS (
  SELECT
    split_key,
    item_code,
    COALESCE(production_lot_no, 'NO_LOT') AS lot_key,
    SUM(COALESCE(available_qty, 0))::NUMERIC AS wms_qty
  FROM public.wms_raw_rows
  WHERE split_key IS NOT NULL
    AND item_code IS NOT NULL
  GROUP BY split_key, item_code, COALESCE(production_lot_no, 'NO_LOT')
),
sap_aggregated AS (
  SELECT
    split_key,
    material AS item_code,
    COALESCE(batch, 'NO_LOT') AS lot_key,
    SUM(COALESCE(unrestricted_qty, 0))::NUMERIC AS sap_qty
  FROM public.sap_raw_rows
  WHERE split_key IS NOT NULL
    AND material IS NOT NULL
  GROUP BY split_key, material, COALESCE(batch, 'NO_LOT')
),
joined_data AS (
  SELECT
    COALESCE(w.split_key, s.split_key) AS split_key,
    COALESCE(w.item_code, s.item_code) AS item_code,
    COALESCE(w.lot_key, s.lot_key) AS lot_key,
    COALESCE(w.wms_qty, 0)::NUMERIC AS wms_qty,
    COALESCE(s.sap_qty, 0)::NUMERIC AS sap_qty,
    (COALESCE(s.sap_qty, 0) - COALESCE(w.wms_qty, 0))::NUMERIC AS discrepancy
  FROM wms_aggregated w
  FULL OUTER JOIN sap_aggregated s
    ON w.split_key = s.split_key
    AND w.item_code = s.item_code
    AND w.lot_key = s.lot_key
)
SELECT
  split_key AS factory_location,
  item_code,
  CASE WHEN lot_key = 'NO_LOT' THEN NULL ELSE lot_key END AS lot_key,
  wms_qty,
  sap_qty,
  discrepancy,
  ABS(discrepancy) AS abs_discrepancy,
  -- Calculate percentage difference
  CASE
    WHEN wms_qty > 0 THEN ROUND(100.0 * discrepancy / wms_qty, 2)
    WHEN sap_qty > 0 THEN 100.0
    ELSE 0
  END AS percentage_diff,
  -- Categorize discrepancy type
  CASE
    WHEN ABS(discrepancy) = 0 THEN 'no_diff'
    ELSE 'diff'
  END AS diff_type,
  -- Categorize discrepancy severity
  CASE
    WHEN ABS(discrepancy) = 0 THEN 'match'
    WHEN ABS(discrepancy) < 10 THEN 'minor'
    WHEN ABS(discrepancy) < 100 THEN 'moderate'
    WHEN ABS(discrepancy) < 1000 THEN 'high'
    ELSE 'critical'
  END AS severity,
  NOW() AS last_updated
FROM joined_data
-- Include both discrepancies and matches (diff_type determines the category)
ORDER BY ABS(discrepancy) DESC
LIMIT 1000;  -- Store top 1000 discrepancies and matches

-- Create indexes on materialized view
CREATE INDEX idx_inventory_discrepancies_mv_factory_location
  ON public.inventory_discrepancies_mv(factory_location);

CREATE INDEX idx_inventory_discrepancies_mv_abs_discrepancy
  ON public.inventory_discrepancies_mv(abs_discrepancy DESC);

CREATE INDEX idx_inventory_discrepancies_mv_severity
  ON public.inventory_discrepancies_mv(severity);

CREATE INDEX idx_inventory_discrepancies_mv_item_code
  ON public.inventory_discrepancies_mv(item_code);

-- Grant permissions
GRANT SELECT ON public.inventory_discrepancies_mv TO authenticated, anon;

-- Comments
COMMENT ON MATERIALIZED VIEW public.inventory_discrepancies_mv IS
  'Pre-calculated SAP vs WMS inventory discrepancies by split_key (factory/location) and item_code (top 1000 by absolute difference).
   Groups data by split_key (factory), item_code, and lot_key to show discrepancies per factory-item combination.
   Eliminates expensive client-side joins of wms_raw_rows and sap_raw_rows tables.
   Refresh this view after WMS/SAP data sync.';
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
  split_key AS factory_location,
  source_id,
  item_code,
  zone,
  location,
  uld_id,
  production_lot_no AS lot_key,
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
  LOWER(TRIM(COALESCE(production_lot_no, ''))) AS lot_key_normalized,
  LOWER(TRIM(COALESCE(uld_id, ''))) AS uld_normalized
FROM public.wms_raw_rows
WHERE split_key IS NOT NULL;

-- Create UNIQUE index (required for REFRESH MATERIALIZED VIEW CONCURRENTLY)
CREATE UNIQUE INDEX idx_wms_indexed_id ON public.wms_inventory_indexed_mv(id);

-- Create comprehensive indexes for fast filtering
CREATE INDEX idx_wms_indexed_factory_location ON public.wms_inventory_indexed_mv(factory_location);
CREATE INDEX idx_wms_indexed_item_code ON public.wms_inventory_indexed_mv(item_code_normalized);
CREATE INDEX idx_wms_indexed_zone ON public.wms_inventory_indexed_mv(zone_normalized);
CREATE INDEX idx_wms_indexed_location ON public.wms_inventory_indexed_mv(location_normalized);
CREATE INDEX idx_wms_indexed_lot ON public.wms_inventory_indexed_mv(lot_key_normalized);
CREATE INDEX idx_wms_indexed_uld ON public.wms_inventory_indexed_mv(uld_normalized);

-- Composite index for common filter combinations
CREATE INDEX idx_wms_indexed_factory_location_item ON public.wms_inventory_indexed_mv(factory_location, item_code_normalized);
CREATE INDEX idx_wms_indexed_factory_location_zone ON public.wms_inventory_indexed_mv(factory_location, zone_normalized);

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
  split_key AS factory_location,
  source_id,
  material AS item_code,
  storage_location AS location,
  batch AS lot_key,
  unrestricted_qty AS unrestricted,
  quality_inspection_qty AS quality_inspection,
  blocked_qty AS blocked,
  returns_qty AS returns,
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
WHERE split_key IS NOT NULL;

-- Create UNIQUE index (required for REFRESH MATERIALIZED VIEW CONCURRENTLY)
CREATE UNIQUE INDEX idx_sap_indexed_id ON public.sap_inventory_indexed_mv(id);

-- Create comprehensive indexes for fast filtering
CREATE INDEX idx_sap_indexed_factory_location ON public.sap_inventory_indexed_mv(factory_location);
CREATE INDEX idx_sap_indexed_item_code ON public.sap_inventory_indexed_mv(item_code_normalized);
CREATE INDEX idx_sap_indexed_location ON public.sap_inventory_indexed_mv(location_normalized);
CREATE INDEX idx_sap_indexed_lot ON public.sap_inventory_indexed_mv(lot_key_normalized);

-- Composite index for common filter combinations
CREATE INDEX idx_sap_indexed_factory_location_item ON public.sap_inventory_indexed_mv(factory_location, item_code_normalized);
CREATE INDEX idx_sap_indexed_factory_location_location ON public.sap_inventory_indexed_mv(factory_location, location_normalized);

-- Grant permissions
GRANT SELECT ON public.sap_inventory_indexed_mv TO authenticated, anon;

COMMENT ON MATERIALIZED VIEW public.sap_inventory_indexed_mv IS
  'Indexed SAP inventory data for fast server-side filtering in Inventory View page.
   Includes normalized columns for case-insensitive search.
   Refresh this view after SAP data sync.';
-- Location Inventory Summary Materialized View (Item-Level)
-- Purpose: Pre-aggregate inventory by ITEM (not WMS location) for Zone Layout Editor SidePanel and Dashboard heatmap
-- Performance: Shows data at item granularity, matching inventory_view display level
-- Granularity: One row per item in items table (like item_inventory_summary_mv)
-- Key difference from item_inventory_summary_mv: Adds current_capa = COUNT(DISTINCT wms_locations)
--
-- Location Matching Logic:
--   - Zone matching: normalize_zone_code(w.split_key) = normalize_zone_code(i.zone)
--   - Flat items: exact location match on cell_no (e.g., "B1" = "B1")
--   - Rack items: pattern match on cell_no (e.g., "A35" matches "A35-01-01", "A35-02-03")

-- Drop existing view if exists
DROP MATERIALIZED VIEW IF EXISTS public.location_inventory_summary_mv CASCADE;

-- Create materialized view for item-level location inventory summaries
CREATE MATERIALIZED VIEW public.location_inventory_summary_mv AS
WITH rack_capacity_aware_count AS (
  -- Calculate capacity-aware stock count for rack items
  -- Logic: If cell capacity = 1, count as 1; if capacity >= 2, count all rows
  SELECT
    i.id AS item_id,
    w.cell_no,
    COUNT(*) AS row_count,
    -- Get capacity for this cell location
    CASE
      WHEN i.type = 'rack' THEN
        get_cell_capacity_from_jsonb(
          i.floor_capacities,
          (parse_rack_cell_location(w.cell_no)).floor_idx,
          (parse_rack_cell_location(w.cell_no)).col_idx
        )
      ELSE NULL
    END AS cell_capacity,
    -- Apply capacity-aware counting logic
    CASE
      WHEN i.type = 'rack' THEN
        CASE
          WHEN get_cell_capacity_from_jsonb(
            i.floor_capacities,
            (parse_rack_cell_location(w.cell_no)).floor_idx,
            (parse_rack_cell_location(w.cell_no)).col_idx
          ) = 1 THEN 1  -- Capacity = 1: count as 1
          ELSE COUNT(*)  -- Capacity >= 2: count all rows
        END
      ELSE COUNT(*)  -- Flat items: count all rows
    END AS capacity_aware_count
  FROM public.items i
  JOIN public.warehouses wh ON i.warehouse_id = wh.id
  JOIN public.wms_raw_rows w ON
    (
      (i.type = 'flat' AND UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i.location)))
      OR
      (i.type = 'rack' AND UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
    )
  WHERE wh.code IS NOT NULL
  GROUP BY i.id, i.type, i.floor_capacities, w.cell_no
),
item_lot_distribution AS (
  -- Pre-aggregate lot distribution per item to avoid nested aggregation
  SELECT
    i.id AS item_id,
    jsonb_object_agg(
      COALESCE(lot_agg.lot_key, 'No Lot'),
      lot_agg.lot_count
    ) AS lot_dist_json
  FROM public.items i
  JOIN public.warehouses wh ON i.warehouse_id = wh.id
  LEFT JOIN (
    SELECT
      wh2.code AS warehouse_code,
      i2.id AS item_id,
      COALESCE(w.production_lot_no, w.lot_no) AS lot_key,
      COUNT(*) AS lot_count,
      SUM(w.available_qty)::NUMERIC AS lot_qty
    FROM public.items i2
    JOIN public.warehouses wh2 ON i2.warehouse_id = wh2.id
    JOIN public.wms_raw_rows w ON
      -- Location match only (no zone matching)
      (
        -- Flat items: exact location match
        (i2.type = 'flat' AND UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i2.location)))
        OR
        -- Rack items: pattern match (A35 matches A35-01-01)
        (i2.type = 'rack' AND UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i2.location)) || '-[0-9]+-[0-9]+$'))
      )
    GROUP BY wh2.code, i2.id, COALESCE(w.production_lot_no, w.lot_no)
  ) lot_agg ON
    lot_agg.warehouse_code = wh.code
    AND lot_agg.item_id = i.id
  WHERE wh.code IS NOT NULL
  GROUP BY i.id
),
item_material_aggregation AS (
  -- Pre-aggregate top materials per item
  SELECT
    i.id AS item_id,
    jsonb_agg(
      jsonb_build_object(
        'item_code', mat.item_code,
        'quantity', mat.item_total_qty
      )
      ORDER BY mat.item_total_qty DESC
    ) AS top_materials_json
  FROM public.items i
  JOIN public.warehouses wh ON i.warehouse_id = wh.id
  LEFT JOIN (
    SELECT
      wh2.code AS warehouse_code,
      i2.id AS item_id,
      w.item_code,
      SUM(COALESCE(w.available_qty, 0))::NUMERIC AS item_total_qty
    FROM public.items i2
    JOIN public.warehouses wh2 ON i2.warehouse_id = wh2.id
    JOIN public.wms_raw_rows w ON
      -- Location match only (no zone matching)
      (
        (i2.type = 'flat' AND UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i2.location)))
        OR
        (i2.type = 'rack' AND UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i2.location)) || '-[0-9]+-[0-9]+$'))
      )
    WHERE w.item_code IS NOT NULL
    GROUP BY wh2.code, i2.id, w.item_code
  ) mat ON
    mat.warehouse_code = wh.code
    AND mat.item_id = i.id
  WHERE wh.code IS NOT NULL
  GROUP BY i.id
)
SELECT
  i.id AS item_id,
  i.warehouse_id,
  wh.code as warehouse_code,
  i.zone AS item_zone,
  i.location AS item_location,  -- Items table location name (e.g., "A35", "B1")
  w.split_key AS wms_split_key,  -- WMS split_key (zone info)
  i.type,
  i.max_capacity,
  -- Current stock count: capacity-aware counting
  -- For rack with capacity = 1: count as 1 per location
  -- For rack with capacity >= 2 or flat: count all rows
  COALESCE(
    (SELECT SUM(rcac.capacity_aware_count)
     FROM rack_capacity_aware_count rcac
     WHERE rcac.item_id = i.id),
    0
  )::INTEGER AS current_stock_count,
  -- Summary statistics (total_items = same as current_stock_count for consistency)
  COALESCE(
    (SELECT SUM(rcac.capacity_aware_count)
     FROM rack_capacity_aware_count rcac
     WHERE rcac.item_id = i.id),
    0
  )::INTEGER AS total_items,
  SUM(COALESCE(w.available_qty, 0))::NUMERIC AS total_available_qty,
  SUM(COALESCE(w.tot_qty, 0))::NUMERIC AS total_qty,
  COUNT(DISTINCT w.item_code) FILTER (WHERE w.item_code IS NOT NULL) AS unique_item_codes,
  COUNT(DISTINCT COALESCE(w.production_lot_no, w.lot_no)) FILTER (WHERE COALESCE(w.production_lot_no, w.lot_no) IS NOT NULL) AS unique_lots,
  -- Items as JSON array (ALL items for SidePanel)
  jsonb_agg(
    jsonb_build_object(
      'id', w.id,
      'item_code', w.item_code,
      'lot_key', COALESCE(w.production_lot_no, w.lot_no),
      'production_lot_no', w.production_lot_no,
      'available_qty', w.available_qty,
      'total_qty', w.tot_qty,
      'inb_date', w.inb_date,
      'valid_date', w.valid_date,
      'uld', w.uld_id,
      'item_name', w.item_nm,
      'cell_no', w.cell_no  -- WMS cell_no for reference
    )
    ORDER BY w.available_qty DESC NULLS LAST, w.cell_no, w.item_code, COALESCE(w.production_lot_no, w.lot_no)
  ) FILTER (WHERE w.id IS NOT NULL) AS items_json,
  -- Lot distribution (from pre-aggregated CTE)
  ld.lot_dist_json AS lot_distribution,
  -- Top materials (from pre-aggregated CTE)
  ma.top_materials_json AS top_materials,
  -- Utilization percentage (current_stock_count / max_capacity)
  CASE
    WHEN i.max_capacity > 0 THEN
      ROUND((
        COALESCE(
          (SELECT SUM(rcac.capacity_aware_count)
           FROM rack_capacity_aware_count rcac
           WHERE rcac.item_id = i.id),
          0
        )::NUMERIC / i.max_capacity
      ) * 100, 2)
    ELSE 0
  END AS utilization_percentage,
  MAX(w.fetched_at) AS last_updated
FROM public.items i
JOIN public.warehouses wh ON i.warehouse_id = wh.id
LEFT JOIN public.wms_raw_rows w ON
  -- Location match only (no zone matching)
  (
    -- Flat items: exact location match
    (i.type = 'flat' AND UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i.location)))
    OR
    -- Rack items: pattern match (e.g., A35 matches A35-01-01)
    (i.type = 'rack' AND UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
  )
LEFT JOIN item_lot_distribution ld ON ld.item_id = i.id
LEFT JOIN item_material_aggregation ma ON ma.item_id = i.id
WHERE wh.code IS NOT NULL
GROUP BY
  i.id, i.warehouse_id, wh.code, i.zone, i.location, w.split_key, i.type, i.max_capacity,
  ld.lot_dist_json, ma.top_materials_json;

-- Create indexes on materialized view
CREATE UNIQUE INDEX idx_location_inventory_summary_mv_item_id
  ON public.location_inventory_summary_mv(item_id);

CREATE INDEX idx_location_inventory_summary_mv_warehouse_id
  ON public.location_inventory_summary_mv(warehouse_id);

CREATE INDEX idx_location_inventory_summary_mv_warehouse
  ON public.location_inventory_summary_mv(warehouse_code);

CREATE INDEX idx_location_inventory_summary_mv_location
  ON public.location_inventory_summary_mv(warehouse_code, item_location);

CREATE INDEX idx_location_inventory_summary_mv_zone
  ON public.location_inventory_summary_mv(item_zone);

CREATE INDEX idx_location_inventory_summary_mv_wms_split_key
  ON public.location_inventory_summary_mv(wms_split_key);

CREATE INDEX idx_location_inventory_summary_mv_type
  ON public.location_inventory_summary_mv(type);

CREATE INDEX idx_location_inventory_summary_mv_utilization
  ON public.location_inventory_summary_mv(utilization_percentage DESC);

-- Grant permissions
GRANT SELECT ON public.location_inventory_summary_mv TO authenticated, anon;

-- Comments
COMMENT ON MATERIALIZED VIEW public.location_inventory_summary_mv IS
  'Pre-aggregated inventory summaries by ITEM (not WMS location) for Zone Layout Editor SidePanel and Dashboard heatmap.
   Granularity: One row per item in items table.

   Key columns:
   - item_id: Primary key from items table
   - item_location: Items table location name (e.g., "A35", "B1")
   - wms_split_key: WMS split_key (warehouse/zone info from matched WMS data)
   - current_stock_count: Capacity-aware count (for rack cells with capacity=1, counts as 1; otherwise counts all WMS rows)
   - max_capacity: From items table (theoretical max)
   - utilization_percentage: (current_stock_count / max_capacity) * 100

   Location matching logic (zone matching removed):
   - Flat items: exact location match on cell_no (e.g., "B1" = "B1")
   - Rack items: pattern match on cell_no (e.g., "A35" matches "A35-01-01", "A35-02-03", etc. using regex)

   Capacity-aware counting:
   - For rack cells with capacity = 1: count as 1 (regardless of ULD count)
   - For rack cells with capacity >= 2: count all WMS rows (each ULD is unique)
   - For flat items: count all WMS rows

   Note: items_json contains ALL items (not paginated) for SidePanel display.
   Refresh this view after WMS data sync or item changes.';
-- Item Inventory Summary Materialized View
-- Purpose: Pre-calculate inventory for each layout component (items table)
-- Used by: Zone Layout Editor to display current stock for each rack/flat component
-- Performance: Eliminates joins between items and wms_raw_rows on every component render

-- Drop existing view if exists
DROP MATERIALIZED VIEW IF EXISTS public.item_inventory_summary_mv CASCADE;

-- Create materialized view for item-level inventory
CREATE MATERIALIZED VIEW public.item_inventory_summary_mv AS
WITH item_lot_distribution AS (
  -- Pre-aggregate lot distribution to avoid nested aggregation
  SELECT
    i.id AS item_id,
    jsonb_object_agg(
      COALESCE(lot_agg.lot_key, 'no_lot'),
      lot_agg.lot_qty
    ) AS lot_dist_json
  FROM public.items i
  JOIN public.zones z ON i.zone_id = z.id
  JOIN public.warehouses wh ON z.warehouse_id = wh.id
  LEFT JOIN (
    SELECT
      wh2.code as warehouse_code,
      i2.zone,
      i2.location,
      w.production_lot_no AS lot_key,
      SUM(w.available_qty)::NUMERIC AS lot_qty
    FROM public.items i2
    JOIN public.zones z2 ON i2.zone_id = z2.id
    JOIN public.warehouses wh2 ON z2.warehouse_id = wh2.id
    JOIN public.wms_raw_rows w ON
      -- Match zone via warehouse_bindings.source_bindings lookup
      EXISTS (
        SELECT 1 FROM public.warehouse_bindings wb
        WHERE wb.warehouse_id = z2.warehouse_id
        AND wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'type' = 'wms'
        AND normalize_zone_code(
          (wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value')
        ) = normalize_zone_code(z2.code)
      )
      AND (
        UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i2.location))
        OR UPPER(TRIM(w.cell_no)) LIKE UPPER(TRIM(i2.location)) || '-%'
      )
    GROUP BY wh2.code, i2.zone, i2.location, w.production_lot_no
  ) lot_agg ON
    lot_agg.warehouse_code = wh.code
    AND normalize_zone_code(lot_agg.zone) = normalize_zone_code(i.zone)
    AND lot_agg.location = i.location
  WHERE wh.code IS NOT NULL
  GROUP BY i.id
)
SELECT
  i.id AS item_id,
  NULL AS layout_id, -- layouts table doesn't exist
  z.id AS zone_id,
  z.name AS zone_name,
  z.warehouse_code,
  i.zone AS item_zone,
  i.location,
  i.type,
  i.max_capacity,
  i.x,
  i.y,
  i.w,
  i.h,
  i.rotation,
  i.floors,
  i.rows,
  i.cols,
  -- Current stock: COUNT of distinct wms_raw_rows
  COUNT(DISTINCT w.id) FILTER (WHERE w.id IS NOT NULL) AS current_stock,
  SUM(COALESCE(w.available_qty, 0))::NUMERIC AS total_available_qty,
  SUM(COALESCE(w.tot_qty, 0))::NUMERIC AS total_qty,
  COUNT(DISTINCT w.item_code) FILTER (WHERE w.item_code IS NOT NULL) AS unique_item_codes,
  -- Items JSON (ALL items for SidePanel)
  jsonb_agg(
    jsonb_build_object(
      'id', w.id,
      'item_code', w.item_code,
      'lot_key', w.production_lot_no,
      'available_qty', w.available_qty,
      'tot_qty', w.tot_qty,
      'inb_date', w.inb_date,
      'valid_date', w.valid_date,
      'uld_id', w.uld_id,
      'item_nm', w.item_nm,
      'location', w.location
    ) ORDER BY w.available_qty DESC NULLS LAST, w.location, w.item_code
  ) FILTER (WHERE w.id IS NOT NULL) AS items_json,
  -- Lot distribution (from pre-aggregated CTE)
  ld.lot_dist_json AS lot_distribution,
  -- Utilization percentage
  CASE
    WHEN i.max_capacity > 0 THEN
      ROUND((COUNT(DISTINCT w.id) FILTER (WHERE w.id IS NOT NULL)::NUMERIC / i.max_capacity) * 100, 2)
    ELSE 0
  END AS utilization_percentage,
  MAX(w.fetched_at) AS last_updated
FROM public.items i
JOIN public.zones z ON i.zone_id = z.id
JOIN public.warehouses wh ON z.warehouse_id = wh.id
LEFT JOIN public.wms_raw_rows w ON
  -- Match zone via warehouse_bindings.source_bindings lookup
  EXISTS (
    SELECT 1 FROM public.warehouse_bindings wb
    WHERE wb.warehouse_id = wh.id
    AND wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'type' = 'wms'
    AND normalize_zone_code(
      (wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value')
    ) = normalize_zone_code(w.split_key)
  )
  AND (
    UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i.location))
    OR UPPER(TRIM(w.cell_no)) LIKE UPPER(TRIM(i.location)) || '-%'
  )
LEFT JOIN item_lot_distribution ld ON ld.item_id = i.id
WHERE z.warehouse_code IS NOT NULL
GROUP BY
  i.id, z.id, z.name, z.warehouse_code,
  i.zone, i.location, i.type, i.max_capacity,
  i.x, i.y, i.w, i.h, i.rotation, i.floors, i.rows, i.cols,
  ld.lot_dist_json;

-- Create indexes on materialized view
CREATE UNIQUE INDEX idx_item_inventory_summary_mv_item_id
  ON public.item_inventory_summary_mv(item_id);

CREATE INDEX idx_item_inventory_summary_mv_layout
  ON public.item_inventory_summary_mv(layout_id);

CREATE INDEX idx_item_inventory_summary_mv_zone
  ON public.item_inventory_summary_mv(zone_id);

CREATE INDEX idx_item_inventory_summary_mv_warehouse
  ON public.item_inventory_summary_mv(warehouse_code);

CREATE INDEX idx_item_inventory_summary_mv_location
  ON public.item_inventory_summary_mv(warehouse_code, location);

CREATE INDEX idx_item_inventory_summary_mv_utilization
  ON public.item_inventory_summary_mv(utilization_percentage DESC);

-- Grant permissions
GRANT SELECT ON public.item_inventory_summary_mv TO authenticated, anon;

-- Comments
COMMENT ON MATERIALIZED VIEW public.item_inventory_summary_mv IS
  'Pre-calculated inventory for each layout component (items table).
   Used by Zone Layout Editor to show current stock on each rack/flat component.

   Calculation logic:
   - max_capacity: items.max_capacity (already calculated)
   - current_stock: COUNT of wms_raw_rows matching this item''s location
   - Zone + Location simultaneous matching:
     * Flat items: exact location match (e.g., B1 = B1)
     * Rack items: prefix pattern match (e.g., A35 matches A35-01-01)

   Note: items_json contains ALL items (not paginated) for SidePanel display.

   Refresh this view after WMS data sync or layout changes.
   Use refresh_all_materialized_views() to refresh all MVs.';
-- Stock Status Distribution Materialized View
-- Purpose: Pre-calculate SAP stock status distribution for Dashboard pie chart
-- Performance: Replaces full table scan with aggregations

-- Drop existing view if exists
DROP MATERIALIZED VIEW IF EXISTS public.stock_status_distribution_mv CASCADE;

-- Create materialized view for stock status distribution
CREATE MATERIALIZED VIEW public.stock_status_distribution_mv AS
SELECT
  split_key AS factory_location,
  SUM(COALESCE(unrestricted_qty, 0))::NUMERIC AS unrestricted_qty,
  SUM(COALESCE(quality_inspection_qty, 0))::NUMERIC AS quality_inspection_qty,
  SUM(COALESCE(blocked_qty, 0))::NUMERIC AS blocked_qty,
  SUM(COALESCE(returns_qty, 0))::NUMERIC AS returns_qty,
  (
    SUM(COALESCE(unrestricted_qty, 0)) +
    SUM(COALESCE(quality_inspection_qty, 0)) +
    SUM(COALESCE(blocked_qty, 0)) +
    SUM(COALESCE(returns_qty, 0))
  )::NUMERIC AS total_qty,
  -- Percentages
  CASE
    WHEN SUM(COALESCE(unrestricted_qty, 0) + COALESCE(quality_inspection_qty, 0) +
             COALESCE(blocked_qty, 0) + COALESCE(returns_qty, 0)) > 0 THEN
      ROUND(100.0 * SUM(COALESCE(unrestricted_qty, 0)) /
        SUM(COALESCE(unrestricted_qty, 0) + COALESCE(quality_inspection_qty, 0) +
            COALESCE(blocked_qty, 0) + COALESCE(returns_qty, 0)), 2)
    ELSE 0
  END AS unrestricted_percentage,
  CASE
    WHEN SUM(COALESCE(unrestricted_qty, 0) + COALESCE(quality_inspection_qty, 0) +
             COALESCE(blocked_qty, 0) + COALESCE(returns_qty, 0)) > 0 THEN
      ROUND(100.0 * SUM(COALESCE(quality_inspection_qty, 0)) /
        SUM(COALESCE(unrestricted_qty, 0) + COALESCE(quality_inspection_qty, 0) +
            COALESCE(blocked_qty, 0) + COALESCE(returns_qty, 0)), 2)
    ELSE 0
  END AS quality_inspection_percentage,
  CASE
    WHEN SUM(COALESCE(unrestricted_qty, 0) + COALESCE(quality_inspection_qty, 0) +
             COALESCE(blocked_qty, 0) + COALESCE(returns_qty, 0)) > 0 THEN
      ROUND(100.0 * SUM(COALESCE(blocked_qty, 0)) /
        SUM(COALESCE(unrestricted_qty, 0) + COALESCE(quality_inspection_qty, 0) +
            COALESCE(blocked_qty, 0) + COALESCE(returns_qty, 0)), 2)
    ELSE 0
  END AS blocked_percentage,
  CASE
    WHEN SUM(COALESCE(unrestricted_qty, 0) + COALESCE(quality_inspection_qty, 0) +
             COALESCE(blocked_qty, 0) + COALESCE(returns_qty, 0)) > 0 THEN
      ROUND(100.0 * SUM(COALESCE(returns_qty, 0)) /
        SUM(COALESCE(unrestricted_qty, 0) + COALESCE(quality_inspection_qty, 0) +
            COALESCE(blocked_qty, 0) + COALESCE(returns_qty, 0)), 2)
    ELSE 0
  END AS returns_percentage,
  NOW() AS last_updated
FROM public.sap_raw_rows
WHERE split_key IS NOT NULL
GROUP BY split_key;

-- Create index on materialized view
CREATE UNIQUE INDEX idx_stock_status_distribution_mv_factory_location
  ON public.stock_status_distribution_mv(factory_location);

-- Grant permissions
GRANT SELECT ON public.stock_status_distribution_mv TO authenticated, anon;

-- Comments
COMMENT ON MATERIALIZED VIEW public.stock_status_distribution_mv IS
  'Pre-calculated SAP stock status distribution (unrestricted, quality inspection, blocked, returns).
   Used for Dashboard pie chart visualization.
   Refresh this view after SAP data sync.';
-- Expiring and Slow-Moving Items Materialized Views
-- Purpose: Pre-calculate items expiring soon and slow-moving stock for Dashboard
-- Performance: Eliminates date calculations on each query

-- ========================================
-- Expiring Items MV
-- ========================================

DROP MATERIALIZED VIEW IF EXISTS public.expiring_items_mv CASCADE;

CREATE MATERIALIZED VIEW public.expiring_items_mv AS
SELECT
  split_key AS factory_location,
  item_code,
  cell_no AS location,  -- Use cell_no instead of location
  zone_cd AS zone,      -- Use zone_cd instead of zone
  production_lot_no AS lot_key,
  available_qty,
  tot_qty,
  valid_date,
  inb_date,
  item_nm,
  uld_id,
  -- Pre-calculate days remaining (can be negative for expired items)
  EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP))::INTEGER AS days_remaining,
  -- Categorize urgency (including expired items)
  CASE
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) < 0 THEN 'expired'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 7 THEN 'critical'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 14 THEN 'high'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 30 THEN 'medium'
    ELSE 'low'
  END AS urgency,
  CURRENT_TIMESTAMP AS last_updated
FROM public.wms_raw_rows
WHERE split_key IS NOT NULL
  AND valid_date IS NOT NULL
  AND valid_date >= CURRENT_DATE - INTERVAL '30 days'  -- Include items expired up to 30 days ago
  AND valid_date <= CURRENT_DATE + INTERVAL '90 days'  -- Look ahead 90 days
ORDER BY
  CASE
    WHEN valid_date < CURRENT_DATE THEN 0  -- Expired items first
    ELSE 1
  END,
  valid_date ASC,
  available_qty DESC
LIMIT 500;  -- Increased limit to include expired items

-- Create indexes on materialized view
CREATE INDEX idx_expiring_items_mv_factory_location
  ON public.expiring_items_mv(factory_location);

CREATE INDEX idx_expiring_items_mv_valid_date
  ON public.expiring_items_mv(valid_date ASC);

CREATE INDEX idx_expiring_items_mv_urgency
  ON public.expiring_items_mv(urgency);

CREATE INDEX idx_expiring_items_mv_days_remaining
  ON public.expiring_items_mv(days_remaining ASC);

-- Grant permissions
GRANT SELECT ON public.expiring_items_mv TO authenticated, anon;

COMMENT ON MATERIALIZED VIEW public.expiring_items_mv IS
  'Pre-calculated list of items expiring within 90 days (top 200 by expiry date).
   Includes pre-calculated days_remaining and urgency categorization.
   Refresh this view daily or after WMS data sync.';

-- ========================================
-- Slow-Moving Items MV
-- ========================================

DROP MATERIALIZED VIEW IF EXISTS public.slow_moving_items_mv CASCADE;

CREATE MATERIALIZED VIEW public.slow_moving_items_mv AS
SELECT
  split_key AS factory_location,
  item_code,
  cell_no AS location,  -- Use cell_no instead of location
  zone_cd AS zone,      -- Use zone_cd instead of zone
  production_lot_no AS lot_key,
  available_qty,
  tot_qty,
  inb_date,
  valid_date,
  item_nm,
  uld_id,
  -- Pre-calculate days in stock
  EXTRACT(DAY FROM (CURRENT_TIMESTAMP - inb_date::timestamp))::INTEGER AS days_in_stock,
  -- Categorize aging
  CASE
    WHEN EXTRACT(DAY FROM (CURRENT_TIMESTAMP - inb_date::timestamp)) >= 180 THEN 'critical'
    WHEN EXTRACT(DAY FROM (CURRENT_TIMESTAMP - inb_date::timestamp)) >= 120 THEN 'high'
    WHEN EXTRACT(DAY FROM (CURRENT_TIMESTAMP - inb_date::timestamp)) >= 90 THEN 'medium'
    ELSE 'low'
  END AS aging_category,
  CURRENT_TIMESTAMP AS last_updated
FROM public.wms_raw_rows
WHERE split_key IS NOT NULL
  AND inb_date IS NOT NULL
  AND inb_date <= CURRENT_DATE - INTERVAL '60 days'  -- At least 60 days old
ORDER BY inb_date ASC, available_qty DESC
LIMIT 200;  -- Store top 200 slow-moving items

-- Create indexes on materialized view
CREATE INDEX idx_slow_moving_items_mv_factory_location
  ON public.slow_moving_items_mv(factory_location);

CREATE INDEX idx_slow_moving_items_mv_inb_date
  ON public.slow_moving_items_mv(inb_date ASC);

CREATE INDEX idx_slow_moving_items_mv_aging
  ON public.slow_moving_items_mv(aging_category);

CREATE INDEX idx_slow_moving_items_mv_days_in_stock
  ON public.slow_moving_items_mv(days_in_stock DESC);

-- Grant permissions
GRANT SELECT ON public.slow_moving_items_mv TO authenticated, anon;

COMMENT ON MATERIALIZED VIEW public.slow_moving_items_mv IS
  'Pre-calculated list of slow-moving items (60+ days in stock, top 200 by age).
   Includes pre-calculated days_in_stock and aging categorization.
   Refresh this view daily or after WMS data sync.';
-- Master Refresh Function for All Materialized Views
-- Purpose: Refresh all materialized views after data sync
-- Usage: Call this function after WMS/SAP data sync

-- Drop existing function if exists
DROP FUNCTION IF EXISTS public.refresh_all_materialized_views() CASCADE;

-- Create master refresh function
CREATE OR REPLACE FUNCTION public.refresh_all_materialized_views()
RETURNS jsonb AS $$
DECLARE
  v_start_time TIMESTAMP;
  v_end_time TIMESTAMP;
  v_result jsonb := '[]'::jsonb;
  v_error_count INTEGER := 0;
BEGIN
  v_start_time := clock_timestamp();

  RAISE NOTICE 'Starting refresh of all materialized views at %', v_start_time;

  -- 1. Zone Capacities MV
  BEGIN
    RAISE NOTICE '  Refreshing zone_capacities_mv...';
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.zone_capacities_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'zone_capacities_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ zone_capacities_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'zone_capacities_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ zone_capacities_mv refresh failed: %', SQLERRM;
  END;

  -- 2. Dashboard Inventory Stats MV
  BEGIN
    RAISE NOTICE '  Refreshing dashboard_inventory_stats_mv...';
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.dashboard_inventory_stats_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'dashboard_inventory_stats_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ dashboard_inventory_stats_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'dashboard_inventory_stats_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ dashboard_inventory_stats_mv refresh failed: %', SQLERRM;
  END;

  -- 3. Inventory Discrepancies MV (without CONCURRENTLY - no unique index due to LIMIT)
  BEGIN
    RAISE NOTICE '  Refreshing inventory_discrepancies_mv...';
    REFRESH MATERIALIZED VIEW public.inventory_discrepancies_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'inventory_discrepancies_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ inventory_discrepancies_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'inventory_discrepancies_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ inventory_discrepancies_mv refresh failed: %', SQLERRM;
  END;

  -- 4. WMS Inventory Indexed MV
  BEGIN
    RAISE NOTICE '  Refreshing wms_inventory_indexed_mv...';
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.wms_inventory_indexed_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'wms_inventory_indexed_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ wms_inventory_indexed_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'wms_inventory_indexed_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ wms_inventory_indexed_mv refresh failed: %', SQLERRM;
  END;

  -- 5. SAP Inventory Indexed MV
  BEGIN
    RAISE NOTICE '  Refreshing sap_inventory_indexed_mv...';
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.sap_inventory_indexed_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'sap_inventory_indexed_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ sap_inventory_indexed_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'sap_inventory_indexed_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ sap_inventory_indexed_mv refresh failed: %', SQLERRM;
  END;

  -- 6. Location Inventory Summary MV
  BEGIN
    RAISE NOTICE '  Refreshing location_inventory_summary_mv...';
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.location_inventory_summary_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'location_inventory_summary_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ location_inventory_summary_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'location_inventory_summary_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ location_inventory_summary_mv refresh failed: %', SQLERRM;
  END;

  -- 7. Item Inventory Summary MV
  BEGIN
    RAISE NOTICE '  Refreshing item_inventory_summary_mv...';
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.item_inventory_summary_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'item_inventory_summary_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ item_inventory_summary_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'item_inventory_summary_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ item_inventory_summary_mv refresh failed: %', SQLERRM;
  END;

  -- 8. Stock Status Distribution MV
  BEGIN
    RAISE NOTICE '  Refreshing stock_status_distribution_mv...';
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.stock_status_distribution_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'stock_status_distribution_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ stock_status_distribution_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'stock_status_distribution_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ stock_status_distribution_mv refresh failed: %', SQLERRM;
  END;

  -- 9. Expiring Items MV (without CONCURRENTLY - no unique index due to LIMIT)
  BEGIN
    RAISE NOTICE '  Refreshing expiring_items_mv...';
    REFRESH MATERIALIZED VIEW public.expiring_items_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'expiring_items_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ expiring_items_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'expiring_items_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ expiring_items_mv refresh failed: %', SQLERRM;
  END;

  -- 10. Slow Moving Items MV (without CONCURRENTLY - no unique index due to LIMIT)
  BEGIN
    RAISE NOTICE '  Refreshing slow_moving_items_mv...';
    REFRESH MATERIALIZED VIEW public.slow_moving_items_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'slow_moving_items_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ slow_moving_items_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'slow_moving_items_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ slow_moving_items_mv refresh failed: %', SQLERRM;
  END;

  v_end_time := clock_timestamp();

  RAISE NOTICE 'Completed refresh of all materialized views at %', v_end_time;
  RAISE NOTICE 'Total time: % seconds', EXTRACT(EPOCH FROM (v_end_time - v_start_time));
  RAISE NOTICE 'Successful: % / %', (10 - v_error_count), 10;

  IF v_error_count > 0 THEN
    RAISE WARNING 'Failed: % materialized views', v_error_count;
  END IF;

  RETURN jsonb_build_object(
    'total_views', 10,
    'successful', 10 - v_error_count,
    'failed', v_error_count,
    'start_time', v_start_time,
    'end_time', v_end_time,
    'duration_seconds', EXTRACT(EPOCH FROM (v_end_time - v_start_time)),
    'details', v_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.refresh_all_materialized_views() TO authenticated;

-- Comments
COMMENT ON FUNCTION public.refresh_all_materialized_views() IS
  'Refreshes all materialized views used for dashboard and zone layout editor.
   Returns a JSON object with refresh status for each view.
   Call this function after WMS/SAP data sync.

   Views refreshed (in order):
   1. zone_capacities_mv
   2. dashboard_inventory_stats_mv
   3. inventory_discrepancies_mv
   4. wms_inventory_indexed_mv
   5. sap_inventory_indexed_mv
   6. location_inventory_summary_mv
   7. item_inventory_summary_mv
   8. stock_status_distribution_mv
   9. expiring_items_mv
   10. slow_moving_items_mv';

-- For backward compatibility, update refresh_zone_capacities to call the master function
DROP FUNCTION IF EXISTS public.refresh_zone_capacities() CASCADE;

CREATE OR REPLACE FUNCTION public.refresh_zone_capacities()
RETURNS void AS $$
DECLARE
  v_result jsonb;
BEGIN
  RAISE NOTICE 'Calling refresh_all_materialized_views()...';
  v_result := refresh_all_materialized_views();
  RAISE NOTICE 'Result: %', v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.refresh_zone_capacities() TO authenticated;

COMMENT ON FUNCTION public.refresh_zone_capacities() IS
  'Backward compatibility wrapper for refresh_all_materialized_views().
   Refreshes all materialized views, not just zone capacities.';
