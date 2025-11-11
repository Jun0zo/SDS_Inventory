-- ==============================================
-- Zone Matching Debug Queries
-- ==============================================

-- 1. WMS 데이터 샘플 확인
SELECT
  w.source_id,
  w.split_key,
  w.zone,
  w.location,
  w.item_code,
  w.warehouse_code
FROM wms_raw_rows w
LIMIT 10;

-- 2. warehouse_bindings 확인
SELECT
  wb.warehouse_id,
  wb.source_bindings
FROM warehouse_bindings wb;

-- 3. layouts와 items 확인
SELECT
  l.id as layout_id,
  l.warehouse_id,
  l.warehouse_code,
  l.zone_name,
  i.id as item_id,
  i.location,
  i.type,
  i.zone as item_zone
FROM layouts l
JOIN items i ON i.layout_id = l.id
LIMIT 10;

-- 4. 실제 매칭 테스트 (warehouse_bindings 조회)
SELECT
  w.source_id,
  w.split_key,
  w.location,
  w.warehouse_code,
  l.zone_name,
  l.warehouse_code as layout_warehouse,
  -- warehouse_bindings에 키가 존재하는지 확인
  wb.source_bindings ? (w.source_id::text || '::' || w.split_key) as key_exists,
  -- split_value 추출
  wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value' as split_value,
  -- normalize 후 비교
  normalize_zone_code(
    wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value'
  ) as normalized_split_value,
  normalize_zone_code(l.zone_name) as normalized_zone_name,
  -- 매칭 결과
  normalize_zone_code(
    wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value'
  ) = normalize_zone_code(l.zone_name) as zone_match
FROM wms_raw_rows w
CROSS JOIN layouts l
LEFT JOIN warehouse_bindings wb ON wb.warehouse_id = l.warehouse_id
WHERE w.warehouse_code = l.warehouse_code
LIMIT 20;

-- 5. 매칭되는 항목 개수 확인
SELECT
  COUNT(*) as total_matches
FROM items i
JOIN layouts l ON i.layout_id = l.id
JOIN wms_raw_rows w ON
  w.warehouse_code = l.warehouse_code
  AND EXISTS (
    SELECT 1 FROM warehouse_bindings wb
    WHERE wb.warehouse_id = l.warehouse_id
    AND wb.source_bindings ? (w.source_id::text || '::' || w.split_key)
    AND normalize_zone_code(
      (wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value')
    ) = normalize_zone_code(l.zone_name)
  )
  AND (
    (i.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)))
    OR
    (i.type = 'rack' AND UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
  );

-- 6. 매칭 실패 원인 분석
SELECT
  'warehouse_bindings missing' as issue,
  COUNT(*) as count
FROM layouts l
LEFT JOIN warehouse_bindings wb ON wb.warehouse_id = l.warehouse_id
WHERE wb.warehouse_id IS NULL

UNION ALL

SELECT
  'source_bindings empty' as issue,
  COUNT(*) as count
FROM warehouse_bindings wb
WHERE wb.source_bindings = '{}'::jsonb OR wb.source_bindings IS NULL

UNION ALL

SELECT
  'split_key not in source_bindings' as issue,
  COUNT(DISTINCT w.id) as count
FROM wms_raw_rows w
JOIN layouts l ON w.warehouse_code = l.warehouse_code
LEFT JOIN warehouse_bindings wb ON wb.warehouse_id = l.warehouse_id
WHERE NOT (wb.source_bindings ? (w.source_id::text || '::' || w.split_key))

UNION ALL

SELECT
  'zone_name mismatch' as issue,
  COUNT(DISTINCT w.id) as count
FROM wms_raw_rows w
JOIN layouts l ON w.warehouse_code = l.warehouse_code
JOIN warehouse_bindings wb ON wb.warehouse_id = l.warehouse_id
WHERE wb.source_bindings ? (w.source_id::text || '::' || w.split_key)
  AND normalize_zone_code(
    (wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value')
  ) != normalize_zone_code(l.zone_name);

-- 7. location_inventory_summary_mv 현재 상태 확인
SELECT
  item_id,
  warehouse_code,
  item_location,
  item_zone,
  type,
  max_capacity,
  current_capa,
  total_items,
  utilization_percentage
FROM location_inventory_summary_mv
LIMIT 20;
