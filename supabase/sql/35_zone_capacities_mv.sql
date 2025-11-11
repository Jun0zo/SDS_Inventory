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
    COUNT(DISTINCT l.id) AS layout_count,
    COUNT(DISTINCT i.id) AS item_count,
    -- Calculate total max capacity for the zone
    -- Sum of all items' max_capacity (already calculated per item)
    -- For flat items: items.max_capacity
    -- For rack items: SUM(floor_capacities) stored in items.max_capacity
    COALESCE(SUM(i.max_capacity), 0)::INTEGER AS max_capacity,
    -- Collect all locations for this zone (for WMS matching)
    array_agg(DISTINCT i.location) FILTER (WHERE i.location IS NOT NULL) AS zone_locations
  FROM public.zones z
  LEFT JOIN public.layouts l ON l.zone_id = z.id
  LEFT JOIN public.items i ON i.layout_id = l.id
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
