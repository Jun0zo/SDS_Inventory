-- Inventory Discrepancies Materialized View
-- Purpose: Pre-calculate SAP vs WMS mismatches to eliminate client-side joins
-- Performance: Replaces expensive client-side join of two large tables with indexed query

-- Drop existing view if exists
DROP MATERIALIZED VIEW IF EXISTS public.inventory_discrepancies_mv CASCADE;

-- Create materialized view for inventory discrepancies
CREATE MATERIALIZED VIEW public.inventory_discrepancies_mv AS
WITH wms_aggregated AS (
  SELECT
    warehouse_code,
    item_code,
    COALESCE(lot_key, 'NO_LOT') AS lot_key,
    SUM(COALESCE(available_qty, 0))::NUMERIC AS wms_qty
  FROM public.wms_raw_rows
  WHERE warehouse_code IS NOT NULL
    AND item_code IS NOT NULL
  GROUP BY warehouse_code, item_code, COALESCE(lot_key, 'NO_LOT')
),
sap_aggregated AS (
  SELECT
    warehouse_code,
    material AS item_code,
    COALESCE(batch, 'NO_LOT') AS lot_key,
    SUM(COALESCE(unrestricted, 0))::NUMERIC AS sap_qty
  FROM public.sap_raw_rows
  WHERE warehouse_code IS NOT NULL
    AND material IS NOT NULL
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
  -- Calculate percentage difference
  CASE
    WHEN wms_qty > 0 THEN ROUND(100.0 * discrepancy / wms_qty, 2)
    WHEN sap_qty > 0 THEN 100.0
    ELSE 0
  END AS percentage_diff,
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
WHERE ABS(discrepancy) >= 1  -- Only store actual discrepancies
ORDER BY ABS(discrepancy) DESC
LIMIT 1000;  -- Store top 1000 discrepancies

-- Create indexes on materialized view
CREATE INDEX idx_inventory_discrepancies_mv_warehouse
  ON public.inventory_discrepancies_mv(warehouse_code);

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
  'Pre-calculated SAP vs WMS inventory discrepancies (top 1000 by absolute difference).
   Eliminates expensive client-side joins of wms_raw_rows and sap_raw_rows tables.
   Refresh this view after WMS/SAP data sync.';
