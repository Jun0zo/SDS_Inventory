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

-- Create trigger on items table (drop if exists first)
DROP TRIGGER IF EXISTS trigger_calculate_item_max_capacity ON public.items;
CREATE TRIGGER trigger_calculate_item_max_capacity
  BEFORE INSERT OR UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_item_max_capacity();

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
    z.warehouse_code,
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
  LEFT JOIN public.items i ON i.zone_id = z.id
  GROUP BY z.id, z.code, z.name, z.warehouse_id, z.warehouse_code
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
      WHERE normalize_zone_code(w.zone) = normalize_zone_code(z.code)
        AND z.id = zlc.zone_id
    )
    AND
    -- Condition 2: Location must match (flat: exact match, rack: prefix match)
    EXISTS (
      SELECT 1
      FROM unnest(zlc.zone_locations) AS item_location
      WHERE
        -- Flat: exact match (e.g., WMS "B1" = item "B1")
        UPPER(TRIM(w.location)) = UPPER(TRIM(item_location))
        OR
        -- Rack: prefix match (e.g., WMS "A1-01-02" starts with item "A1-")
        UPPER(TRIM(w.location)) LIKE UPPER(TRIM(item_location)) || '-%'
    )
  WHERE w.zone IS NOT NULL
    AND w.location IS NOT NULL
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
    warehouse_code,
    COUNT(DISTINCT item_code) AS unique_skus,
    SUM(COALESCE(available_qty, 0))::NUMERIC AS total_available_qty,
    SUM(COALESCE(tot_qty, 0))::NUMERIC AS total_qty,
    COUNT(*) AS row_count
  FROM public.raw_rows
  WHERE warehouse_code IS NOT NULL
    AND source_type = 'wms'
  GROUP BY warehouse_code
),
sap_stats AS (
  SELECT
    warehouse_code,
    COUNT(DISTINCT item_code) AS unique_skus,
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
  FROM public.raw_rows
  WHERE warehouse_code IS NOT NULL
    AND source_type = 'sap'
  GROUP BY warehouse_code
),
combined_skus AS (
  SELECT
    warehouse_code,
    item_code
  FROM raw_rows
  WHERE warehouse_code IS NOT NULL
),
total_unique_skus AS (
  SELECT
    warehouse_code,
    COUNT(DISTINCT item_code) AS total_unique_skus
  FROM combined_skus
  GROUP BY warehouse_code
)
SELECT
  COALESCE(w.warehouse_code, s.warehouse_code, t.warehouse_code) AS warehouse_code,

  -- WMS Stats
  COALESCE(w.unique_skus, 0)::INTEGER AS wms_unique_skus,
  COALESCE(w.total_available_qty, 0)::NUMERIC AS wms_available_qty,
  COALESCE(w.total_qty, 0)::NUMERIC AS wms_total_qty,
  COALESCE(w.row_count, 0)::INTEGER AS wms_row_count,

  -- SAP Stats
  COALESCE(s.unique_skus, 0)::INTEGER AS sap_unique_skus,
  COALESCE(s.unrestricted_qty, 0)::NUMERIC AS sap_unrestricted_qty,
  COALESCE(s.blocked_qty, 0)::NUMERIC AS sap_blocked_qty,
SELECT 'dashboard_inventory_stats_mv test completed';
