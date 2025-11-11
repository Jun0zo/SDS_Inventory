-- ==============================================
-- Location Inventory Summary MV 디버깅
-- 단계별로 하나씩 실행하면서 문제를 찾아보자
-- ==============================================

-- 단계 1: 기본 데이터 존재 확인
-- 이 쿼리가 모두 0이 아니어야 함
SELECT 'STEP 1: 기본 데이터 확인' as step;
SELECT
  'items' as table_name, COUNT(*) as count FROM items
UNION ALL
SELECT 'zones', COUNT(*) FROM zones
UNION ALL
SELECT 'warehouse_bindings', COUNT(*) FROM warehouse_bindings
UNION ALL
SELECT 'wms_raw_rows', COUNT(*) FROM wms_raw_rows
ORDER BY table_name;

-- 단계 2: WMS 데이터 구조 확인
-- split_key가 NULL이 아니고, zone/location이 있는 데이터만 확인
SELECT 'STEP 2: WMS 데이터 구조' as step;
SELECT
  source_id,
  split_key,
  zone_cd,
  cell_no,
  item_code,
  COUNT(*) as row_count
FROM wms_raw_rows
WHERE split_key IS NOT NULL
  AND zone_cd IS NOT NULL
  AND cell_no IS NOT NULL
GROUP BY source_id, split_key, zone_cd, cell_no, item_code
ORDER BY row_count DESC
LIMIT 10;

-- 단계 3: warehouse_bindings 설정 확인
-- source_bindings에 데이터가 있어야 함
SELECT 'STEP 3: warehouse_bindings 설정' as step;
SELECT
  wb.warehouse_id,
  w.code as warehouse_code,
  wb.source_bindings,
  CASE WHEN wb.source_bindings IS NULL OR wb.source_bindings = '{}'::jsonb
       THEN 'EMPTY - 바인딩 설정 필요!'
       ELSE 'OK' END as status
FROM warehouse_bindings wb
LEFT JOIN warehouses w ON wb.warehouse_id = w.id;

-- 단계 4: source_bindings 키 구조 분석
-- WMS의 source_id::split_key 형식의 키가 바인딩에 있는지 확인
SELECT 'STEP 4: 바인딩 키 구조 분석' as step;
SELECT
  w.source_id,
  w.split_key,
  w.zone_cd,
  -- 생성될 키
  (w.source_id::text || '::' || w.split_key) as expected_key,
  -- 바인딩에 이 키가 있는지
  wb.source_bindings ? (w.source_id::text || '::' || w.split_key) as key_exists_in_binding,
  -- 키가 있으면 어떤 값이 매핑되는지
  CASE WHEN wb.source_bindings ? (w.source_id::text || '::' || w.split_key)
       THEN wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value'
       ELSE 'NO MAPPING' END as mapped_zone,
  -- 실제 존과 비교
  w.zone as wms_zone,
  normalize_zone_code(w.zone) as normalized_wms_zone,
  CASE WHEN wb.source_bindings ? (w.source_id::text || '::' || w.split_key)
       THEN normalize_zone_code(wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value')
       ELSE NULL END as normalized_mapped_zone
FROM wms_raw_rows w
CROSS JOIN warehouse_bindings wb
WHERE w.split_key IS NOT NULL
  AND wb.source_bindings IS NOT NULL
  AND wb.source_bindings != '{}'::jsonb
LIMIT 20;

-- 단계 5: 존 매칭 테스트 (첫 번째 EXISTS 조건)
-- 이 쿼리가 결과를 반환해야 존 매칭이 작동하는 것
SELECT 'STEP 5: 존 매칭 테스트' as step;
SELECT DISTINCT
  z.id as zone_id,
  z.code as zone_code,
  z.warehouse_code,
  wb.warehouse_id,
  w.source_id,
  w.split_key,
  w.zone as wms_zone,
  -- 존 매칭 조건 확인
  EXISTS (
    SELECT 1 FROM warehouse_bindings wb2
    WHERE wb2.warehouse_id = z.warehouse_id
    AND wb2.source_bindings ? (w.source_id::text || '::' || w.split_key)
    AND normalize_zone_code(
      wb2.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value'
    ) = normalize_zone_code(z.code)
  ) as zone_matches
FROM items i
JOIN zones z ON i.zone_id = z.id
CROSS JOIN wms_raw_rows w
JOIN warehouse_bindings wb ON wb.warehouse_id = z.warehouse_id
WHERE z.warehouse_code IS NOT NULL
  AND w.split_key IS NOT NULL
  AND w.cell_no IS NOT NULL
LIMIT 20;

-- 단계 6: 위치 매칭 테스트 (두 번째 조건)
-- 존 매칭이 성공한 데이터에 대해서 위치 매칭을 테스트
SELECT 'STEP 6: 위치 매칭 테스트' as step;
SELECT
  z.code as zone_code,
  i.location as item_location,
  i.type as item_type,
  w.cell_no as wms_location,
  -- 존 매칭 성공 여부
  EXISTS (
    SELECT 1 FROM warehouse_bindings wb
    WHERE wb.warehouse_id = z.warehouse_id
    AND wb.source_bindings ? (w.source_id::text || '::' || w.split_key)
    AND normalize_zone_code(
      wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value'
    ) = normalize_zone_code(z.code)
  ) as zone_matches,
  -- 위치 매칭 조건
  CASE
    WHEN i.type = 'flat' THEN UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i.location))
    WHEN i.type = 'rack' THEN UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$')
    ELSE false
  END as location_matches,
  -- 전체 매칭
  CASE
    WHEN i.type = 'flat' THEN UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i.location))
    WHEN i.type = 'rack' THEN UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$')
    ELSE false
  END AND EXISTS (
    SELECT 1 FROM warehouse_bindings wb
    WHERE wb.warehouse_id = z.warehouse_id
    AND wb.source_bindings ? (w.source_id::text || '::' || w.split_key)
    AND normalize_zone_code(
      wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value'
    ) = normalize_zone_code(z.code)
  ) as full_matches
FROM items i
JOIN zones z ON i.zone_id = z.id
CROSS JOIN wms_raw_rows w
WHERE z.warehouse_code IS NOT NULL
  AND w.split_key IS NOT NULL
  AND w.cell_no IS NOT NULL
LIMIT 50;

-- 단계 7: 실제 JOIN 결과 확인
-- MV에서 사용하는 것과 동일한 JOIN을 직접 실행
SELECT 'STEP 7: 실제 JOIN 결과' as step;
SELECT
  COUNT(*) as total_possible_combinations,
  COUNT(CASE WHEN zone_match AND location_match THEN 1 END) as matching_rows,
  COUNT(DISTINCT CASE WHEN zone_match AND location_match THEN i.id END) as unique_items_matched,
  COUNT(DISTINCT CASE WHEN zone_match AND location_match THEN w.id END) as unique_wms_rows_matched
FROM (
  SELECT
    i.id as item_id,
    z.code as zone_code,
    w.id as wms_id,
    -- 존 매칭
    EXISTS (
      SELECT 1 FROM warehouse_bindings wb
      WHERE wb.warehouse_id = z.warehouse_id
      AND wb.source_bindings ? (w.source_id::text || '::' || w.split_key)
      AND normalize_zone_code(
        wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value'
      ) = normalize_zone_code(z.code)
    ) as zone_match,
    -- 위치 매칭
    CASE
      WHEN i.type = 'flat' THEN UPPER(TRIM(w.location)) = UPPER(TRIM(i.location))
      WHEN i.type = 'rack' THEN UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$')
      ELSE false
    END as location_match
  FROM items i
  JOIN zones z ON i.zone_id = z.id
  LEFT JOIN wms_raw_rows w ON
    -- 존 매칭 조건
    EXISTS (
      SELECT 1 FROM warehouse_bindings wb
      WHERE wb.warehouse_id = z.warehouse_id
      AND wb.source_bindings ? (w.source_id::text || '::' || w.split_key)
      AND normalize_zone_code(
        wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value'
      ) = normalize_zone_code(z.code)
    )
    AND (
      -- 위치 매칭 조건
      (i.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)))
      OR
      (i.type = 'rack' AND UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
    )
  WHERE z.warehouse_code IS NOT NULL
    AND w.split_key IS NOT NULL
) matches;

-- 단계 8: MV 상태 최종 확인
SELECT 'STEP 8: MV 최종 상태' as step;
SELECT
  COUNT(*) as current_mv_rows,
  COUNT(CASE WHEN current_capa > 0 THEN 1 END) as rows_with_capacity,
  COUNT(CASE WHEN total_items > 0 THEN 1 END) as rows_with_items,
  COUNT(CASE WHEN utilization_percentage > 0 THEN 1 END) as rows_with_utilization
FROM location_inventory_summary_mv;

-- 단계 9: MV가 비어있다면 수동으로 데이터 생성해보기
-- (이 단계는 MV가 비어있을 때만 실행)
SELECT 'STEP 9: 수동 데이터 생성 테스트' as step;
SELECT
  i.id AS item_id,
  z.warehouse_code,
  i.zone AS item_zone,
  i.location AS item_location,
  i.type,
  i.max_capacity,
  COUNT(DISTINCT w.cell_no) FILTER (WHERE w.id IS NOT NULL) AS current_capa,
  COUNT(*) FILTER (WHERE w.id IS NOT NULL) AS total_items,
  SUM(COALESCE(w.available_qty, 0))::NUMERIC AS total_available_qty,
  COUNT(DISTINCT w.item_code) FILTER (WHERE w.item_code IS NOT NULL) AS unique_item_codes
FROM items i
JOIN zones z ON i.zone_id = z.id
LEFT JOIN wms_raw_rows w ON
  -- 존 매칭 조건
  EXISTS (
    SELECT 1 FROM warehouse_bindings wb
    WHERE wb.warehouse_id = z.warehouse_id
    AND wb.source_bindings ? (w.source_id::text || '::' || w.split_key)
    AND normalize_zone_code(
      wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value'
    ) = normalize_zone_code(z.code)
  )
  AND (
    -- 위치 매칭 조건
    (i.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)))
    OR
    (i.type = 'rack' AND UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
  )
WHERE z.warehouse_code IS NOT NULL
GROUP BY i.id, z.warehouse_code, i.zone, i.location, i.type, i.max_capacity
HAVING COUNT(DISTINCT w.cell_no) FILTER (WHERE w.id IS NOT NULL) > 0
ORDER BY total_items DESC
LIMIT 10;
