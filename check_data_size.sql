-- Check data size that affects MV refresh performance
-- Run this in Supabase SQL Editor to see why timeout occurs

-- 1. Check wms_raw_rows count (main bottleneck)
SELECT
  'wms_raw_rows' AS table_name,
  COUNT(*) AS row_count,
  pg_size_pretty(pg_total_relation_size('wms_raw_rows')) AS total_size
FROM wms_raw_rows;

-- 2. Check items count
SELECT
  'items' AS table_name,
  COUNT(*) AS row_count,
  pg_size_pretty(pg_total_relation_size('items')) AS total_size
FROM items;

-- 3. Check materials count
SELECT
  'materials' AS table_name,
  COUNT(*) AS row_count,
  pg_size_pretty(pg_total_relation_size('materials')) AS total_size
FROM materials;

-- 4. Check MV size
SELECT
  'mv_component_metadata' AS view_name,
  COUNT(*) AS row_count,
  pg_size_pretty(pg_total_relation_size('mv_component_metadata')) AS total_size
FROM mv_component_metadata;

-- 5. Check if there are any long-running queries currently
SELECT
  pid,
  now() - query_start AS duration,
  state,
  query
FROM pg_stat_activity
WHERE state != 'idle'
  AND query NOT ILIKE '%pg_stat_activity%'
ORDER BY duration DESC
LIMIT 10;

-- 6. Estimate MV refresh time by testing the query
EXPLAIN ANALYZE
SELECT
  i.id AS item_id,
  i.warehouse_id,
  i.location,
  i.zone,
  i.expected_major_category,
  i.expected_minor_category
FROM items i
LEFT JOIN wms_raw_rows w ON
  UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i.location)) || '(-[0-9]+-[0-9]+)?$')
  AND normalize_zone_code(w.zone) = normalize_zone_code(i.zone)
LEFT JOIN materials m ON m.item_code = w.item_code
GROUP BY i.id, i.location, i.zone
LIMIT 100;
