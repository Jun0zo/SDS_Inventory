-- ============================================
-- Fix zone_capacities_mv using location_inventory_summary_mv
-- ============================================
-- Purpose: Rebuild zone_capacities_mv to use location_inventory_summary_mv as source
--          This fixes the incorrect zone matching logic
-- ============================================

-- Drop existing view
DROP MATERIALIZED VIEW IF EXISTS public.zone_capacities_mv CASCADE;

-- Recreate zone_capacities_mv using location_inventory_summary_mv as source
CREATE MATERIALIZED VIEW public.zone_capacities_mv AS
WITH zone_aggregates AS (
  -- Aggregate location_inventory_summary_mv data by zone
  SELECT
    z.id AS zone_id,
    z.code AS zone_code,
    z.name AS zone_name,
    z.warehouse_id,
    wh.code AS warehouse_code,
    0 AS layout_count, -- layouts table doesn't exist
    COUNT(DISTINCT lis.item_id) AS item_count,
    -- Zone max capacity: sum of all items' max_capacity in this zone
    COALESCE(SUM(lis.max_capacity), 0)::INTEGER AS max_capacity,
    -- Zone current stock: sum of all items' current_stock_count in this zone
    COALESCE(SUM(lis.current_stock_count), 0)::INTEGER AS current_stock,
    -- Total available quantity
    COALESCE(SUM(lis.total_available_qty), 0)::NUMERIC AS total_available_qty
  FROM public.zones z
  LEFT JOIN public.warehouses wh ON z.warehouse_id = wh.id
  LEFT JOIN public.location_inventory_summary_mv lis ON
    lis.warehouse_id = z.warehouse_id
    AND UPPER(TRIM(lis.item_zone)) = UPPER(TRIM(z.code))
  GROUP BY z.id, z.code, z.name, z.warehouse_id, wh.code
)
SELECT
  zone_id,
  zone_code,
  zone_name,
  warehouse_id,
  warehouse_code,
  layout_count,
  item_count,
  max_capacity,
  current_stock,
  total_available_qty,
  -- Calculate utilization percentage
  CASE
    WHEN max_capacity > 0 THEN
      ROUND((current_stock::NUMERIC / max_capacity::NUMERIC * 100), 2)
    ELSE 0
  END AS utilization_percentage,
  -- Capacity status categorization
  CASE
    WHEN max_capacity = 0 THEN 'no_capacity'
    WHEN current_stock::NUMERIC / NULLIF(max_capacity, 0)::NUMERIC >= 0.9 THEN 'critical'
    WHEN current_stock::NUMERIC / NULLIF(max_capacity, 0)::NUMERIC >= 0.7 THEN 'high'
    WHEN current_stock::NUMERIC / NULLIF(max_capacity, 0)::NUMERIC >= 0.5 THEN 'medium'
    ELSE 'low'
  END AS capacity_status,
  NOW() AS last_updated
FROM zone_aggregates;

-- Create indexes on materialized view (same as before)
CREATE UNIQUE INDEX idx_zone_capacities_mv_zone_id
  ON public.zone_capacities_mv(zone_id);

CREATE INDEX idx_zone_capacities_mv_warehouse_code
  ON public.zone_capacities_mv(warehouse_code);

CREATE INDEX idx_zone_capacities_mv_status
  ON public.zone_capacities_mv(capacity_status);

CREATE INDEX idx_zone_capacities_mv_utilization
  ON public.zone_capacities_mv(utilization_percentage DESC);

-- Grant permissions
GRANT SELECT ON public.zone_capacities_mv TO authenticated, anon;

-- Comments
COMMENT ON MATERIALIZED VIEW public.zone_capacities_mv IS
  'Pre-calculated zone capacities with current stock levels and utilization percentages.
   Now based on location_inventory_summary_mv for accurate stock counts.
   Refresh this view after location_inventory_summary_mv is refreshed.';

-- Refresh the new view
REFRESH MATERIALIZED VIEW public.zone_capacities_mv;

-- Verify the results
SELECT
  zone_code,
  warehouse_code,
  item_count,
  max_capacity,
  current_stock,
  utilization_percentage,
  capacity_status
FROM public.zone_capacities_mv
ORDER BY zone_code
LIMIT 20;
