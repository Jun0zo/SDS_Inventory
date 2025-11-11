-- ============================================
-- Materialized Views for Dashboard and Analytics
-- Run this file AFTER 01_schema_complete.sql (OPTIONAL)
-- These views improve performance for dashboards and reports
-- ============================================

-- IMPORTANT: Add missing columns to items table if needed
-- These columns are required for capacity calculations

ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS max_capacity INTEGER DEFAULT 0;

ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS floor_capacities INTEGER[] DEFAULT '{}';

-- ============================================
-- Helper Functions for Materialized Views
-- ============================================

-- Helper function to sum integer arrays
CREATE OR REPLACE FUNCTION public.array_sum_int(arr INTEGER[])
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

COMMENT ON FUNCTION public.array_sum_int IS
  'Sums all elements in an integer array, treating NULL values as 0';

-- Function to calculate max_capacity for items
CREATE OR REPLACE FUNCTION public.calculate_item_max_capacity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'rack' THEN
    NEW.max_capacity := public.array_sum_int(NEW.floor_capacities);
  ELSIF NEW.type = 'flat' THEN
    NEW.max_capacity := COALESCE(NEW.max_capacity, 0);
  ELSE
    NEW.max_capacity := COALESCE(NEW.max_capacity, 0);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.calculate_item_max_capacity IS
  'Calculates max_capacity for items based on type and floor_capacities';

-- Create trigger on items table
DROP TRIGGER IF EXISTS trigger_calculate_item_max_capacity ON public.items;
CREATE TRIGGER trigger_calculate_item_max_capacity
  BEFORE INSERT OR UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_item_max_capacity();

-- Update existing items to calculate max_capacity
UPDATE public.items
SET max_capacity = CASE
  WHEN type = 'rack' THEN public.array_sum_int(floor_capacities)
  ELSE COALESCE(max_capacity, 0)
END
WHERE max_capacity IS NULL OR (type = 'rack' AND floor_capacities IS NOT NULL);

-- ============================================
-- 1. Zone Capacities Materialized View
-- ============================================

DROP MATERIALIZED VIEW IF EXISTS public.zone_capacities_mv CASCADE;

CREATE MATERIALIZED VIEW public.zone_capacities_mv AS
WITH zone_layout_capacity AS (
  SELECT
    z.id AS zone_id,
    z.code AS zone_code,
    z.name AS zone_name,
    z.warehouse_id,
    z.warehouse_code,
    COUNT(DISTINCT l.id) AS layout_count,
    COUNT(DISTINCT i.id) AS item_count,
    COALESCE(SUM(i.max_capacity), 0)::INTEGER AS max_capacity,
    array_agg(DISTINCT i.location) FILTER (WHERE i.location IS NOT NULL) AS zone_locations
  FROM public.zones z
  LEFT JOIN public.layouts l ON l.zone_id = z.id
  LEFT JOIN public.items i ON i.layout_id = l.id
  GROUP BY z.id, z.code, z.name, z.warehouse_id, z.warehouse_code
),
wms_current_stock AS (
  SELECT
    zlc.zone_id,
    COUNT(DISTINCT w.id) AS current_stock_count,
    SUM(COALESCE(w.available_qty, 0))::NUMERIC AS total_available_qty
  FROM zone_layout_capacity zlc
  JOIN public.wms_raw_rows w ON
    EXISTS (
      SELECT 1
      FROM public.zone_aliases za
      WHERE public.normalize_zone_code(w.zone) = public.normalize_zone_code(za.alias)
        AND za.zone_id = zlc.zone_id
    )
    AND
    EXISTS (
      SELECT 1
      FROM unnest(zlc.zone_locations) AS item_location
      WHERE
        UPPER(TRIM(w.location)) = UPPER(TRIM(item_location))
        OR
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
  COALESCE(wcs.current_stock_count, 0)::INTEGER AS current_stock,
  COALESCE(wcs.total_available_qty, 0)::NUMERIC AS total_available_qty,
  CASE
    WHEN zlc.max_capacity > 0 THEN
      ROUND(
        (COALESCE(wcs.current_stock_count, 0)::NUMERIC / zlc.max_capacity::NUMERIC * 100),
        2
      )
    ELSE 0
  END AS utilization_percentage,
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

CREATE UNIQUE INDEX idx_zone_capacities_mv_zone_id
  ON public.zone_capacities_mv(zone_id);
CREATE INDEX idx_zone_capacities_mv_warehouse_code
  ON public.zone_capacities_mv(warehouse_code);
CREATE INDEX idx_zone_capacities_mv_status
  ON public.zone_capacities_mv(capacity_status);
CREATE INDEX idx_zone_capacities_mv_utilization
  ON public.zone_capacities_mv(utilization_percentage DESC);

GRANT SELECT ON public.zone_capacities_mv TO authenticated, anon;

COMMENT ON MATERIALIZED VIEW public.zone_capacities_mv IS
  'Pre-calculated zone capacities with current stock levels and utilization percentages';

-- ============================================
-- 2. Dashboard Inventory Stats Materialized View
-- ============================================

DROP MATERIALIZED VIEW IF EXISTS public.dashboard_inventory_stats_mv CASCADE;

CREATE MATERIALIZED VIEW public.dashboard_inventory_stats_mv AS
WITH wms_stats AS (
  SELECT
    warehouse_code,
    COUNT(DISTINCT item_code) AS unique_skus,
    SUM(COALESCE(available_qty, 0))::NUMERIC AS total_available_qty,
    SUM(COALESCE(tot_qty, 0))::NUMERIC AS total_qty,
    COUNT(*) AS row_count
  FROM public.wms_raw_rows
  WHERE warehouse_code IS NOT NULL
  GROUP BY warehouse_code
),
sap_stats AS (
  SELECT
    warehouse_code,
    COUNT(DISTINCT material) AS unique_skus,
    SUM(COALESCE(unrestricted, 0))::NUMERIC AS unrestricted_qty,
    SUM(COALESCE(blocked, 0))::NUMERIC AS blocked_qty,
    SUM(COALESCE(quality_inspection, 0))::NUMERIC AS quality_inspection_qty,
    SUM(COALESCE(returns, 0))::NUMERIC AS returns_qty,
    (
      SUM(COALESCE(unrestricted, 0)) +
      SUM(COALESCE(blocked, 0)) +
      SUM(COALESCE(quality_inspection, 0)) +
      SUM(COALESCE(returns, 0))
    )::NUMERIC AS total_qty,
    COUNT(*) AS row_count
  FROM public.sap_raw_rows
  WHERE warehouse_code IS NOT NULL
  GROUP BY warehouse_code
),
combined_skus AS (
  SELECT warehouse_code, item_code FROM wms_raw_rows WHERE warehouse_code IS NOT NULL
  UNION
  SELECT warehouse_code, material AS item_code FROM sap_raw_rows WHERE warehouse_code IS NOT NULL
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
  COALESCE(w.unique_skus, 0)::INTEGER AS wms_unique_skus,
  COALESCE(w.total_available_qty, 0)::NUMERIC AS wms_available_qty,
  COALESCE(w.total_qty, 0)::NUMERIC AS wms_total_qty,
  COALESCE(w.row_count, 0)::INTEGER AS wms_row_count,
  COALESCE(s.unique_skus, 0)::INTEGER AS sap_unique_skus,
  COALESCE(s.unrestricted_qty, 0)::NUMERIC AS sap_unrestricted_qty,
  COALESCE(s.blocked_qty, 0)::NUMERIC AS sap_blocked_qty,
  COALESCE(s.quality_inspection_qty, 0)::NUMERIC AS sap_quality_inspection_qty,
  COALESCE(s.returns_qty, 0)::NUMERIC AS sap_returns_qty,
  COALESCE(s.total_qty, 0)::NUMERIC AS sap_total_qty,
  COALESCE(s.row_count, 0)::INTEGER AS sap_row_count,
  COALESCE(t.total_unique_skus, 0)::INTEGER AS total_unique_skus,
  (COALESCE(w.total_qty, 0) + COALESCE(s.total_qty, 0))::NUMERIC AS combined_total_qty,
  CASE
    WHEN COALESCE(w.total_qty, 0) > 0 THEN
      ROUND(100.0 * COALESCE(w.total_available_qty, 0) / COALESCE(w.total_qty, 0), 2)
    ELSE 0
  END AS wms_available_percentage,
  NOW() AS last_updated
FROM wms_stats w
FULL OUTER JOIN sap_stats s ON w.warehouse_code = s.warehouse_code
FULL OUTER JOIN total_unique_skus t ON COALESCE(w.warehouse_code, s.warehouse_code) = t.warehouse_code;

CREATE UNIQUE INDEX idx_dashboard_inventory_stats_mv_warehouse
  ON public.dashboard_inventory_stats_mv(warehouse_code);

GRANT SELECT ON public.dashboard_inventory_stats_mv TO authenticated, anon;

COMMENT ON MATERIALIZED VIEW public.dashboard_inventory_stats_mv IS
  'Pre-calculated dashboard KPI metrics including total inventory, available stock, and unique SKU counts';

-- ============================================
-- 3. Inventory Discrepancies Materialized View
-- ============================================

DROP MATERIALIZED VIEW IF EXISTS public.inventory_discrepancies_mv CASCADE;

CREATE MATERIALIZED VIEW public.inventory_discrepancies_mv AS
WITH wms_aggregated AS (
  SELECT
    warehouse_code,
    item_code,
    COALESCE(lot_key, 'NO_LOT') AS lot_key,
    SUM(COALESCE(available_qty, 0))::NUMERIC AS wms_qty
  FROM public.wms_raw_rows
  WHERE warehouse_code IS NOT NULL AND item_code IS NOT NULL
  GROUP BY warehouse_code, item_code, COALESCE(lot_key, 'NO_LOT')
),
sap_aggregated AS (
  SELECT
    warehouse_code,
    material AS item_code,
    COALESCE(batch, 'NO_LOT') AS lot_key,
    SUM(COALESCE(unrestricted, 0))::NUMERIC AS sap_qty
  FROM public.sap_raw_rows
  WHERE warehouse_code IS NOT NULL AND material IS NOT NULL
  GROUP BY warehouse_code, material, COALESCE(batch, 'NO_LOT')
),
joined_data AS (
  SELECT
    COALESCE(w.warehouse_code, s.warehouse_code) AS warehouse_code,
    COALESCE(w.item_code, s.item_code) AS item_code,
    COALESCE(w.lot_key, s.lot_key) AS lot_key,
    COALESCE(w.wms_qty, 0)::NUMERIC AS wms_qty,
    COALESCE(s.sap_qty, 0)::NUMERIC AS sap_qty,
    (COALESCE(s.sap_qty, 0) - COALESCE(w.wms_qty, 0))::NUMERIC AS discrepancy
  FROM wms_aggregated w
  FULL OUTER JOIN sap_aggregated s
    ON w.warehouse_code = s.warehouse_code
    AND w.item_code = s.item_code
    AND w.lot_key = s.lot_key
)
SELECT
  warehouse_code,
  item_code,
  CASE WHEN lot_key = 'NO_LOT' THEN NULL ELSE lot_key END AS lot_key,
  wms_qty,
  sap_qty,
  discrepancy,
  ABS(discrepancy) AS abs_discrepancy,
  CASE
    WHEN wms_qty > 0 THEN ROUND(100.0 * discrepancy / wms_qty, 2)
    WHEN sap_qty > 0 THEN 100.0
    ELSE 0
  END AS percentage_diff,
  CASE
    WHEN ABS(discrepancy) = 0 THEN 'match'
    WHEN ABS(discrepancy) < 10 THEN 'minor'
    WHEN ABS(discrepancy) < 100 THEN 'moderate'
    WHEN ABS(discrepancy) < 1000 THEN 'high'
    ELSE 'critical'
  END AS severity,
  NOW() AS last_updated
FROM joined_data
WHERE ABS(discrepancy) >= 1
ORDER BY ABS(discrepancy) DESC
LIMIT 1000;

CREATE INDEX idx_inventory_discrepancies_mv_warehouse
  ON public.inventory_discrepancies_mv(warehouse_code);
CREATE INDEX idx_inventory_discrepancies_mv_abs_discrepancy
  ON public.inventory_discrepancies_mv(abs_discrepancy DESC);
CREATE INDEX idx_inventory_discrepancies_mv_severity
  ON public.inventory_discrepancies_mv(severity);
CREATE INDEX idx_inventory_discrepancies_mv_item_code
  ON public.inventory_discrepancies_mv(item_code);

GRANT SELECT ON public.inventory_discrepancies_mv TO authenticated, anon;

COMMENT ON MATERIALIZED VIEW public.inventory_discrepancies_mv IS
  'Pre-calculated SAP vs WMS inventory discrepancies (top 1000 by absolute difference)';

-- ============================================
-- 4. WMS Inventory Indexed Materialized View
-- ============================================

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
  LOWER(TRIM(item_code)) AS item_code_normalized,
  LOWER(TRIM(zone)) AS zone_normalized,
  LOWER(TRIM(location)) AS location_normalized,
  LOWER(TRIM(COALESCE(lot_key, ''))) AS lot_key_normalized,
  LOWER(TRIM(COALESCE(uld_id, ''))) AS uld_normalized
FROM public.wms_raw_rows
WHERE warehouse_code IS NOT NULL;

CREATE INDEX idx_wms_indexed_warehouse ON public.wms_inventory_indexed_mv(warehouse_code);
CREATE INDEX idx_wms_indexed_item_code ON public.wms_inventory_indexed_mv(item_code_normalized);
CREATE INDEX idx_wms_indexed_zone ON public.wms_inventory_indexed_mv(zone_normalized);
CREATE INDEX idx_wms_indexed_location ON public.wms_inventory_indexed_mv(location_normalized);
CREATE INDEX idx_wms_indexed_lot ON public.wms_inventory_indexed_mv(lot_key_normalized);
CREATE INDEX idx_wms_indexed_uld ON public.wms_inventory_indexed_mv(uld_normalized);
CREATE INDEX idx_wms_indexed_warehouse_item ON public.wms_inventory_indexed_mv(warehouse_code, item_code_normalized);
CREATE INDEX idx_wms_indexed_warehouse_zone ON public.wms_inventory_indexed_mv(warehouse_code, zone_normalized);

GRANT SELECT ON public.wms_inventory_indexed_mv TO authenticated, anon;

COMMENT ON MATERIALIZED VIEW public.wms_inventory_indexed_mv IS
  'Indexed WMS inventory data for fast server-side filtering in Inventory View page';

-- ============================================
-- 5. SAP Inventory Indexed Materialized View
-- ============================================

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
  LOWER(TRIM(material)) AS item_code_normalized,
  LOWER(TRIM(storage_location)) AS location_normalized,
  LOWER(TRIM(COALESCE(batch, ''))) AS lot_key_normalized
FROM public.sap_raw_rows
WHERE warehouse_code IS NOT NULL;

CREATE INDEX idx_sap_indexed_warehouse ON public.sap_inventory_indexed_mv(warehouse_code);
CREATE INDEX idx_sap_indexed_item_code ON public.sap_inventory_indexed_mv(item_code_normalized);
CREATE INDEX idx_sap_indexed_location ON public.sap_inventory_indexed_mv(location_normalized);
CREATE INDEX idx_sap_indexed_lot ON public.sap_inventory_indexed_mv(lot_key_normalized);
CREATE INDEX idx_sap_indexed_warehouse_item ON public.sap_inventory_indexed_mv(warehouse_code, item_code_normalized);
CREATE INDEX idx_sap_indexed_warehouse_location ON public.sap_inventory_indexed_mv(warehouse_code, location_normalized);

GRANT SELECT ON public.sap_inventory_indexed_mv TO authenticated, anon;

COMMENT ON MATERIALIZED VIEW public.sap_inventory_indexed_mv IS
  'Indexed SAP inventory data for fast server-side filtering in Inventory View page';

-- ============================================
-- 6. Master Refresh Function
-- ============================================

CREATE OR REPLACE FUNCTION public.refresh_all_materialized_views()
RETURNS jsonb AS $$
DECLARE
  v_start_time TIMESTAMP;
  v_end_time TIMESTAMP;
  v_result jsonb := '[]'::jsonb;
  v_error_count INTEGER := 0;
  v_total_views INTEGER := 5;
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
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'zone_capacities_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  zone_capacities_mv refresh failed: %', SQLERRM;
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
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'dashboard_inventory_stats_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  dashboard_inventory_stats_mv refresh failed: %', SQLERRM;
  END;

  -- 3. Inventory Discrepancies MV
  BEGIN
    RAISE NOTICE '  Refreshing inventory_discrepancies_mv...';
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.inventory_discrepancies_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'inventory_discrepancies_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'inventory_discrepancies_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  inventory_discrepancies_mv refresh failed: %', SQLERRM;
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
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'wms_inventory_indexed_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  wms_inventory_indexed_mv refresh failed: %', SQLERRM;
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
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'sap_inventory_indexed_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  sap_inventory_indexed_mv refresh failed: %', SQLERRM;
  END;

  v_end_time := clock_timestamp();

  RAISE NOTICE 'Completed refresh of all materialized views at %', v_end_time;
  RAISE NOTICE 'Total time: % seconds', EXTRACT(EPOCH FROM (v_end_time - v_start_time));
  RAISE NOTICE 'Successful: % / %', (v_total_views - v_error_count), v_total_views;

  IF v_error_count > 0 THEN
    RAISE WARNING 'Failed: % materialized views', v_error_count;
  END IF;

  RETURN jsonb_build_object(
    'total_views', v_total_views,
    'successful', v_total_views - v_error_count,
    'failed', v_error_count,
    'start_time', v_start_time,
    'end_time', v_end_time,
    'duration_seconds', EXTRACT(EPOCH FROM (v_end_time - v_start_time)),
    'details', v_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.refresh_all_materialized_views() TO authenticated;

COMMENT ON FUNCTION public.refresh_all_materialized_views() IS
  'Refreshes all materialized views. Call this function after WMS/SAP data sync.';

-- ============================================
-- Initial Refresh
-- ============================================

-- Uncomment the line below to perform initial refresh
-- SELECT public.refresh_all_materialized_views();

-- ============================================
-- Migration Complete!
-- ============================================
