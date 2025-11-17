-- Check actual urgency values in expiring_items_mv
SELECT
  item_code,
  lot_key,
  available_qty,
  valid_date,
  days_remaining,
  urgency,
  uld_id,
  factory_location,
  -- Calculate what urgency SHOULD be
  CASE
    WHEN valid_date IS NULL THEN 'should_be_no_expiry'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) < 0 THEN 'should_be_expired'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 7 THEN 'should_be_critical'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 14 THEN 'should_be_high'
    WHEN EXTRACT(DAY FROM (valid_date::timestamp - CURRENT_TIMESTAMP)) <= 30 THEN 'should_be_medium'
    ELSE 'should_be_low'
  END AS calculated_urgency
FROM public.expiring_items_mv
WHERE item_code IN ('12500579', '12000325')
ORDER BY item_code, valid_date;
