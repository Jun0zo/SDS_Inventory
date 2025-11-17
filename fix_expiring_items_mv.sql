-- ============================================
-- Fix expiring_items_mv ORDER BY logic
-- ============================================
-- Purpose: Prioritize expiring items (critical/high/medium) over expired items
--          This ensures that urgent items are visible in the UI
-- ============================================

-- Drop existing view
DROP MATERIALIZED VIEW IF EXISTS public.expiring_items_mv CASCADE;

-- Recreate expiring_items_mv with corrected ORDER BY
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
  -- Calculate days_remaining
  CASE
    WHEN valid_date IS NOT NULL THEN
      EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP))::INTEGER
    ELSE
      NULL
  END AS days_remaining,
  -- Calculate urgency
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
    valid_date IS NULL  -- Items without expiry date
    OR (
      -- Include items expiring within 90 days OR expired within 30 days
      valid_date >= CURRENT_DATE - INTERVAL '30 days'
      AND valid_date <= CURRENT_DATE + INTERVAL '90 days'
    )
  )
ORDER BY
  -- Prioritize by urgency: critical/high/medium first, then expired, then low/no_expiry
  CASE
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 7 THEN 0    -- critical (expiring in 7 days)
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 14 THEN 1   -- high (expiring in 14 days)
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 30 THEN 2   -- medium (expiring in 30 days)
    WHEN valid_date IS NOT NULL AND valid_date < CURRENT_DATE THEN 3                  -- expired (already expired)
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) > 30 THEN 4    -- low (expiring later)
    WHEN valid_date IS NULL THEN 5                                                     -- no_expiry
    ELSE 6
  END,
  valid_date ASC NULLS LAST,
  available_qty DESC
LIMIT 1000;  -- Increased limit to ensure we capture enough expiring items

-- Create indexes
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

-- Comments
COMMENT ON MATERIALIZED VIEW public.expiring_items_mv IS
  'Pre-calculated list of items expiring within 90 days (top 1000).
   Prioritizes urgent items (critical/high/medium) over expired items.
   Urgency order: critical → high → medium → expired → low → no_expiry.
   Refresh this view daily or after WMS data sync.';

-- Refresh the view
REFRESH MATERIALIZED VIEW public.expiring_items_mv;

-- Verify the results
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
