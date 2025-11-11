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
  SELECT
    warehouse_code,
    item_code
  FROM wms_raw_rows
  WHERE warehouse_code IS NOT NULL

  UNION

  SELECT
    warehouse_code,
    material AS item_code
  FROM sap_raw_rows
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
FULL OUTER JOIN sap_stats s ON w.warehouse_code = s.warehouse_code
FULL OUTER JOIN total_unique_skus t ON COALESCE(w.warehouse_code, s.warehouse_code) = t.warehouse_code;

-- Create indexes on materialized view
CREATE UNIQUE INDEX idx_dashboard_inventory_stats_mv_warehouse
  ON public.dashboard_inventory_stats_mv(warehouse_code);

-- Grant permissions
GRANT SELECT ON public.dashboard_inventory_stats_mv TO authenticated, anon;

-- Comments
COMMENT ON MATERIALIZED VIEW public.dashboard_inventory_stats_mv IS
  'Pre-calculated dashboard KPI metrics including total inventory, available stock, and unique SKU counts.
   Refresh this view after WMS/SAP data sync.';

-- Refresh function will be added in a separate migration
-- SELECT refresh_zone_capacities(); will be extended to refresh all MVs
