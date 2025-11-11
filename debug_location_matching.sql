-- ==============================================
-- Location Inventory Summary MV Debug
-- ==============================================

-- 1. 기본 테이블 데이터 확인
SELECT 'items count:' as info, COUNT(*) FROM items
UNION ALL
SELECT 'zones count:', COUNT(*) FROM zones
UNION ALL
SELECT 'warehouse_bindings count:', COUNT(*) FROM warehouse_bindings
UNION ALL
SELECT 'wms_raw_rows count:', COUNT(*) FROM wms_raw_rows
UNION ALL
SELECT 'sap_raw_rows count:', COUNT(*) FROM sap_raw_rows;

-- 2. warehouse_bindings 데이터 구조 확인
SELECT
  wb.warehouse_id,
  w.code as warehouse_code,
  wb.source_bindings
FROM warehouse_bindings wb
JOIN warehouses w ON wb.warehouse_id = w.id;

-- 3. zones 데이터 확인
SELECT
  z.id,
  z.code,
  z.name,
  z.warehouse_id,
  z.warehouse_code,
  w.code as actual_warehouse_code
FROM zones z
LEFT JOIN warehouses w ON z.warehouse_id = w.id
LIMIT 10;

-- 4. items 데이터 확인
SELECT
  i.id,
  i.zone_id,
  i.location,
  i.type,
  i.max_capacity,
  z.code as zone_code,
  z.warehouse_code
FROM items i
JOIN zones z ON i.zone_id = z.id
LIMIT 10;

-- 5. WMS 데이터 샘플 확인
SELECT
  w.id,
  w.source_id,
  w.split_key,
  w.zone_cd,
  w.cell_no,
  w.location,  -- 참고용
  w.item_code
FROM wms_raw_rows w
WHERE split_key IS NOT NULL
LIMIT 10;

-- 6. warehouse_bindings 키 존재 여부 테스트 (상세 버전)
SELECT
  w.source_id,
  w.split_key,
  w.zone_cd,
  w.cell_no,
  w.location,  -- 참고용
  wb.warehouse_id,
  w.warehouse_code,
  -- 생성된 키 확인
  (w.source_id::text || '::' || w.split_key) as generated_key,
  -- 키 존재 및 type 확인
  wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'type' = 'wms' as is_wms_key,
  -- split_value 추출
  wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value' as split_value,
  -- source_bindings 전체 구조
  wb.source_bindings as full_bindings,
  -- warehouse_bindings의 모든 키들
  (SELECT array_agg(key) FROM jsonb_object_keys(wb.source_bindings) as key) as all_keys_in_binding,
  -- zone 매칭
  CASE WHEN wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'type' = 'wms'
       THEN normalize_zone_code(wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value')
       ELSE NULL END as normalized_split_value,
  normalize_zone_code(w.zone_cd) as normalized_wms_zone
FROM wms_raw_rows w
CROSS JOIN warehouse_bindings wb
WHERE w.split_key IS NOT NULL
  AND wb.source_bindings IS NOT NULL
  AND wb.source_bindings != '{}'::jsonb  -- 빈 객체 제외
LIMIT 20;

-- 6.5. warehouse_bindings의 실제 구조 분석
SELECT
  wb.warehouse_id,
  w.code as warehouse_code,
  wb.source_bindings,
  -- 바인딩에 있는 모든 키들
  CASE WHEN wb.source_bindings != '{}'::jsonb
       THEN (SELECT array_agg(key) FROM jsonb_object_keys(wb.source_bindings) as key)
       ELSE NULL END as binding_keys,
  -- 각 키의 값들
  CASE WHEN wb.source_bindings != '{}'::jsonb
       THEN (SELECT jsonb_agg(wb.source_bindings->key)
             FROM jsonb_object_keys(wb.source_bindings) as key)
       ELSE NULL END as binding_values
FROM warehouse_bindings wb
LEFT JOIN warehouses w ON wb.warehouse_id = w.id;

-- 6.6. WMS source_id와 sheet_sources 관계 확인
SELECT
  w.source_id,
  ss.id,
  ss.label,
  ss.type,
  ss.spreadsheet_id,
  w.split_key,
  w.zone_cd,
  w.cell_no,
  w.location  -- 참고용
FROM wms_raw_rows w
LEFT JOIN sheet_sources ss ON w.source_id = ss.id
WHERE w.split_key IS NOT NULL
LIMIT 10;

-- 6.7. WMS 데이터의 source_id 패턴 분석
SELECT
  source_id,
  split_key,
  COUNT(*) as row_count,
  array_agg(DISTINCT zone) as zones,
  array_agg(DISTINCT cell_no) as sample_cell_nos,
  array_agg(DISTINCT location) as sample_locations  -- 참고용
FROM wms_raw_rows
WHERE split_key IS NOT NULL
GROUP BY source_id, split_key
ORDER BY row_count DESC
LIMIT 10;

-- 7. 실제 매칭 시도 (단순 버전)
SELECT
  i.id as item_id,
  i.location as item_location,
  i.type as item_type,
  z.code as zone_code,
  wh.code as warehouse_code,  -- warehouses.code 사용
  w.source_id,
  w.split_key,
  w.cell_no as wms_cell_no,
  w.location as wms_location,  -- 참고용
  w.zone_cd as wms_zone,
  -- warehouse_binding 존재 확인
  EXISTS (
    SELECT 1 FROM warehouse_bindings wb
    WHERE wb.warehouse_id = wh.id  -- warehouses.id 사용
    AND wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'type' = 'wms'
  ) as binding_exists,
  -- zone 매칭 확인
  EXISTS (
    SELECT 1 FROM warehouse_bindings wb
    WHERE wb.warehouse_id = wh.id  -- warehouses.id 사용
    AND wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'type' = 'wms'
    AND normalize_zone_code(
      wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value'
    ) = normalize_zone_code(w.split_key)
  ) as zone_matches,
  -- location 매칭 확인
  CASE
    WHEN i.type = 'flat' THEN UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i.location))
    WHEN i.type = 'rack' THEN UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$')
    ELSE false
  END as location_matches
FROM items i
JOIN zones z ON i.zone_id = z.id
JOIN warehouses wh ON z.warehouse_id = wh.id  -- warehouses 테이블 JOIN
CROSS JOIN wms_raw_rows w
WHERE wh.code IS NOT NULL
  AND w.split_key IS NOT NULL
  AND w.cell_no IS NOT NULL
LIMIT 50;

-- 8. 매칭 성공한 항목들만 보기
SELECT
  COUNT(*) as matching_rows,
  i.type,
  z.code as zone_code,
  wh.code as warehouse_code  -- warehouses.code 사용
FROM items i
JOIN zones z ON i.zone_id = z.id
JOIN warehouses wh ON z.warehouse_id = wh.id  -- warehouses 테이블 JOIN
JOIN wms_raw_rows w ON
  -- Match zone via warehouse_bindings
  EXISTS (
    SELECT 1 FROM warehouse_bindings wb
    WHERE wb.warehouse_id = wh.id  -- warehouses.id 사용
    AND wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'type' = 'wms'
    AND normalize_zone_code(
      wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value'
    ) = normalize_zone_code(w.split_key)
  )
  AND (
    -- Flat items: exact location match
    (i.type = 'flat' AND UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i.location)))
    OR
    -- Rack items: pattern match
    (i.type = 'rack' AND UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
  )
WHERE wh.code IS NOT NULL
GROUP BY i.type, z.code, wh.code;  -- warehouses.code 사용

-- 8. warehouse_bindings 설정 방법 예시
-- WMS 데이터에서 실제 source_id와 split_key를 확인한 후 설정
SELECT
  '예시: 다음 키들을 warehouse_bindings에 추가해야 함:' as instruction,
  w.source_id,
  w.split_key,
  w.zone_cd,
  string_agg(DISTINCT w.zone_cd, ', ') as all_zones_in_group,
  COUNT(*) as row_count
FROM wms_raw_rows w
WHERE w.split_key IS NOT NULL
GROUP BY w.source_id, w.split_key, w.zone_cd
ORDER BY row_count DESC
LIMIT 5;

-- 9. 바인딩 설정 SQL 생성 (복사해서 사용)
SELECT
  '-- 다음 SQL을 실행해서 바인딩 설정:' as instruction,
  format(
    'UPDATE warehouse_bindings SET source_bindings = jsonb_set(COALESCE(source_bindings, ''{}''), ''{%s}'', ''{"split_value": "%s"}'') WHERE warehouse_id = (SELECT id FROM warehouses WHERE code = ''YOUR_WAREHOUSE_CODE'');',
    (w.source_id::text || '::' || w.split_key),
    w.zone_cd
  ) as sql_to_execute
FROM wms_raw_rows w
WHERE w.split_key IS NOT NULL
GROUP BY w.source_id, w.split_key, w.zone_cd
ORDER BY COUNT(*) DESC
LIMIT 3;

-- 10. location_inventory_summary_mv 현재 상태
SELECT
  COUNT(*) as total_rows,
  COUNT(CASE WHEN current_capa > 0 THEN 1 END) as rows_with_capacity,
  COUNT(CASE WHEN total_items > 0 THEN 1 END) as rows_with_items
FROM location_inventory_summary_mv;

-- 11. WMS 데이터의 cell_no 값들 확인
SELECT
  cell_no,
  location,  -- 비교를 위해 location도 표시
  zone,
  item_code,
  COUNT(*) as count
FROM wms_raw_rows
WHERE cell_no IS NOT NULL
GROUP BY cell_no, location, zone, item_code
ORDER BY count DESC
LIMIT 20;
