-- ============================================
-- Apply All Fixes: Zone Capacities + Expiring Items
-- ============================================
-- Run this file in Supabase SQL Editor to apply all fixes
-- ============================================

-- 1. Fix zone_capacities_mv
DROP MATERIALIZED VIEW IF EXISTS public.zone_capacities_mv CASCADE;

CREATE MATERIALIZED VIEW public.zone_capacities_mv AS
WITH zone_aggregates AS (
  SELECT
    z.id AS zone_id,
    z.code AS zone_code,
    z.name AS zone_name,
    z.warehouse_id,
    wh.code AS warehouse_code,
    0 AS layout_count,
    COUNT(DISTINCT lis.item_id) AS item_count,
    COALESCE(SUM(lis.max_capacity), 0)::INTEGER AS max_capacity,
    COALESCE(SUM(lis.current_stock_count), 0)::INTEGER AS current_stock,
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
  CASE
    WHEN max_capacity > 0 THEN
      ROUND((current_stock::NUMERIC / max_capacity::NUMERIC * 100), 2)
    ELSE 0
  END AS utilization_percentage,
  CASE
    WHEN max_capacity = 0 THEN 'no_capacity'
    WHEN current_stock::NUMERIC / NULLIF(max_capacity, 0)::NUMERIC >= 0.9 THEN 'critical'
    WHEN current_stock::NUMERIC / NULLIF(max_capacity, 0)::NUMERIC >= 0.7 THEN 'high'
    WHEN current_stock::NUMERIC / NULLIF(max_capacity, 0)::NUMERIC >= 0.5 THEN 'medium'
    ELSE 'low'
  END AS capacity_status,
  NOW() AS last_updated
FROM zone_aggregates;

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
  'Pre-calculated zone capacities based on location_inventory_summary_mv.
   Refresh AFTER location_inventory_summary_mv is refreshed.';

-- 2. Fix expiring_items_mv
DROP MATERIALIZED VIEW IF EXISTS public.expiring_items_mv CASCADE;

CREATE MATERIALIZED VIEW public.expiring_items_mv AS
SELECT
  split_key AS factory_location,
  item_code,
  cell_no AS location,
  zone_cd AS zone,
  production_lot_no AS lot_key,
  available_qty,
  tot_qty,
  valid_date,
  inb_date,
  item_nm,
  uld_id,
  CASE
    WHEN valid_date IS NOT NULL THEN
      EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP))::INTEGER
    ELSE
      NULL
  END AS days_remaining,
  CASE
    WHEN valid_date IS NULL THEN 'no_expiry'::text
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) < 0 THEN 'expired'::text
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 7 THEN 'critical'::text
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 14 THEN 'high'::text
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 30 THEN 'medium'::text
    ELSE 'low'::text
  END AS urgency,
  CURRENT_TIMESTAMP AS last_updated
FROM public.wms_raw_rows
WHERE split_key IS NOT NULL
  AND (
    valid_date IS NULL
    OR (
      valid_date >= CURRENT_DATE - INTERVAL '30 days'
      AND valid_date <= CURRENT_DATE + INTERVAL '90 days'
    )
  )
ORDER BY
  CASE
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 7 THEN 0
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 14 THEN 1
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 30 THEN 2
    WHEN valid_date IS NOT NULL AND valid_date < CURRENT_DATE THEN 3
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) > 30 THEN 4
    WHEN valid_date IS NULL THEN 5
    ELSE 6
  END,
  valid_date ASC NULLS LAST,
  available_qty DESC
LIMIT 1000;

CREATE INDEX idx_expiring_items_mv_factory_location
  ON public.expiring_items_mv(factory_location);
CREATE INDEX idx_expiring_items_mv_valid_date
  ON public.expiring_items_mv(valid_date ASC);
CREATE INDEX idx_expiring_items_mv_urgency
  ON public.expiring_items_mv(urgency);
CREATE INDEX idx_expiring_items_mv_days_remaining
  ON public.expiring_items_mv(days_remaining ASC);

GRANT SELECT ON public.expiring_items_mv TO authenticated, anon;

COMMENT ON MATERIALIZED VIEW public.expiring_items_mv IS
  'Pre-calculated list of items expiring within 90 days (top 1000).
   Prioritizes urgent items (critical/high/medium) over expired items.';

-- 3. Refresh both views
REFRESH MATERIALIZED VIEW public.zone_capacities_mv;
REFRESH MATERIALIZED VIEW public.expiring_items_mv;

-- 4. Verify results
SELECT 'Zone Capacities MV:' AS info;
SELECT zone_code, max_capacity, current_stock, utilization_percentage
FROM public.zone_capacities_mv
ORDER BY zone_code
LIMIT 10;

SELECT '' AS separator;
SELECT 'Expiring Items MV - Urgency Distribution:' AS info;
SELECT
  urgency,
  COUNT(*) AS count,
  MIN(days_remaining) AS min_days,
  MAX(days_remaining) AS max_days
FROM public.expiring_items_mv
GROUP BY urgency
ORDER BY
  CASE urgency
    WHEN 'critical' THEN 0
    WHEN 'high' THEN 1
    WHEN 'medium' THEN 2
    WHEN 'expired' THEN 3
    WHEN 'low' THEN 4
    WHEN 'no_expiry' THEN 5
  END;

SELECT '' AS separator;
SELECT 'Expiring Items MV - Sample Data:' AS info;
SELECT
  item_code,
  lot_key,
  available_qty,
  uld_id,
  days_remaining,
  urgency
FROM public.expiring_items_mv
WHERE urgency != 'no_expiry'
ORDER BY days_remaining ASC NULLS LAST
LIMIT 10;
