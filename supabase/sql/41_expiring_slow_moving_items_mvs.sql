-- Expiring and Slow-Moving Items Materialized Views
-- Purpose: Pre-calculate items expiring soon and slow-moving stock for Dashboard
-- Performance: Eliminates date calculations on each query

-- ========================================
-- Expiring Items MV
-- ========================================

DROP MATERIALIZED VIEW IF EXISTS public.expiring_items_mv CASCADE;

CREATE MATERIALIZED VIEW public.expiring_items_mv AS
SELECT
  warehouse_code,
  item_code,
  location,
  zone,
  lot_key,
  available_qty,
  tot_qty,
  valid_date,
  inb_date,
  item_nm,
  uld_id,
  -- Pre-calculate days remaining
  EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP))::INTEGER AS days_remaining,
  -- Categorize urgency
  CASE
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 7 THEN 'critical'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 14 THEN 'high'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 30 THEN 'medium'
    ELSE 'low'
  END AS urgency,
  CURRENT_TIMESTAMP AS last_updated
FROM public.wms_raw_rows
WHERE warehouse_code IS NOT NULL
  AND valid_date IS NOT NULL
  AND valid_date >= CURRENT_DATE
  AND valid_date <= CURRENT_DATE + INTERVAL '90 days'  -- Look ahead 90 days
ORDER BY valid_date ASC, available_qty DESC
LIMIT 200;  -- Store top 200 expiring items

-- Create indexes on materialized view
CREATE INDEX idx_expiring_items_mv_warehouse
  ON public.expiring_items_mv(warehouse_code);

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
  warehouse_code,
  item_code,
  location,
  zone,
  lot_key,
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
WHERE warehouse_code IS NOT NULL
  AND inb_date IS NOT NULL
  AND inb_date <= CURRENT_DATE - INTERVAL '60 days'  -- At least 60 days old
ORDER BY inb_date ASC, available_qty DESC
LIMIT 200;  -- Store top 200 slow-moving items

-- Create indexes on materialized view
CREATE INDEX idx_slow_moving_items_mv_warehouse
  ON public.slow_moving_items_mv(warehouse_code);

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
