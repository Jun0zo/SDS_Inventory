-- ============================================
-- Debug expiring_items_mv
-- ============================================

-- 1. Check current expiring_items_mv data
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

-- 2. Sample data from expiring_items_mv
SELECT
  item_code,
  lot_key,
  available_qty,
  valid_date,
  days_remaining,
  urgency,
  uld_id,
  factory_location
FROM public.expiring_items_mv
ORDER BY
  CASE urgency
    WHEN 'critical' THEN 0
    WHEN 'high' THEN 1
    WHEN 'medium' THEN 2
    WHEN 'expired' THEN 3
    WHEN 'low' THEN 4
    WHEN 'no_expiry' THEN 5
  END
LIMIT 20;

-- 3. Check raw WMS data for valid_date distribution
SELECT
  CASE
    WHEN valid_date IS NULL THEN 'no_expiry'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) < 0 THEN 'expired'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 7 THEN 'critical'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 14 THEN 'high'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 30 THEN 'medium'
    ELSE 'low'
  END AS urgency,
  COUNT(*) AS count
FROM public.wms_raw_rows
WHERE split_key IS NOT NULL
GROUP BY
  CASE
    WHEN valid_date IS NULL THEN 'no_expiry'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) < 0 THEN 'expired'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 7 THEN 'critical'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 14 THEN 'high'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 30 THEN 'medium'
    ELSE 'low'
  END
ORDER BY
  CASE
    WHEN valid_date IS NULL THEN 5
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) < 0 THEN 3
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 7 THEN 0
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 14 THEN 1
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 30 THEN 2
    ELSE 4
  END;
