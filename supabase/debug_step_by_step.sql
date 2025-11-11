-- ==============================================
-- Location Inventory Summary MV Debug - 단계별 쿼리
-- ==============================================
-- split_key와 items.location을 직접 비교하는 방식으로 디버깅

-- ==============================================
-- Step 1: WMS 데이터 확인
-- ==============================================
-- WMS 데이터가 어떻게 생겼는지 확인 (split_key 중심)
SELECT
  w.id,
  w.source_id,
  w.split_key,
  w.zone,
  w.location,
  w.item_code,
  w.warehouse_code,
  w.available_qty
FROM wms_raw_rows w
ORDER BY w.split_key, w.location
LIMIT 20;

-- ==============================================
-- Step 2: Items 테이블 확인
-- ==============================================
-- Items 테이블의 location, type 확인
SELECT
  i.id as item_id,
  i.layout_id,
  i.location as item_location,
  i.type,
  i.max_capacity,
  i.zone,
  l.warehouse_code,
  l.zone_name
FROM items i
JOIN layouts l ON i.layout_id = l.id
ORDER BY i.location
LIMIT 20;

-- ==============================================
-- Step 3: Warehouse 코드 매칭 확인
-- ==============================================
-- WMS와 Items의 warehouse_code가 일치하는지 확인
SELECT DISTINCT
  w.warehouse_code as wms_wh,
  l.warehouse_code as layout_wh,
  CASE WHEN w.warehouse_code = l.warehouse_code THEN '일치' ELSE '불일치' END as match_status
FROM wms_raw_rows w
CROSS JOIN (SELECT DISTINCT warehouse_code FROM layouts) l
ORDER BY w.warehouse_code, l.warehouse_code;

-- ==============================================
-- Step 4: Split_key vs Items.location 직접 비교
-- ==============================================
-- split_key와 items.location을 normalize해서 비교 (warehouse_code 필터링)
SELECT
  w.split_key,
  normalize_zone_code(w.split_key) as normalized_split_key,
  i.location as item_location,
  normalize_zone_code(i.location) as normalized_item_location,
  CASE WHEN normalize_zone_code(w.split_key) = normalize_zone_code(i.location) THEN '일치' ELSE '불일치' END as direct_match,
  w.warehouse_code as wms_wh,
  l.warehouse_code as item_wh,
  CASE WHEN w.warehouse_code = l.warehouse_code THEN 'WH일치' ELSE 'WH불일치' END as wh_match
FROM wms_raw_rows w
CROSS JOIN items i
JOIN layouts l ON l.id = i.layout_id
WHERE w.warehouse_code = l.warehouse_code
LIMIT 50;

-- ==============================================
-- Step 4b: Warehouse 코드 필터 없이 전체 비교
-- ==============================================
-- warehouse_code 필터 없이 모든 조합 검사 (디버깅용)
SELECT
  w.split_key,
  normalize_zone_code(w.split_key) as normalized_split_key,
  i.location as item_location,
  normalize_zone_code(i.location) as normalized_item_location,
  CASE WHEN normalize_zone_code(w.split_key) = normalize_zone_code(i.location) THEN '일치' ELSE '불일치' END as direct_match,
  w.warehouse_code as wms_wh,
  l.warehouse_code as item_wh,
  CASE WHEN w.warehouse_code = l.warehouse_code THEN 'WH일치' ELSE 'WH불일치' END as wh_match
FROM wms_raw_rows w
CROSS JOIN items i
JOIN layouts l ON l.id = i.layout_id
WHERE normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
LIMIT 50;

-- ==============================================
-- Step 5: Location 매칭 세부 로직 테스트
-- ==============================================
-- Flat vs Rack 타입별 location 매칭 로직 확인 (warehouse_code 필터링)
SELECT
  w.location as wms_location,
  w.split_key,
  i.location as item_location,
  i.type,
  w.warehouse_code as wms_wh,
  l.warehouse_code as item_wh,
  -- Zone 매칭 (split_key vs items.location)
  normalize_zone_code(w.split_key) as split_key_norm,
  normalize_zone_code(i.location) as item_location_norm,
  normalize_zone_code(w.split_key) = normalize_zone_code(i.location) as zone_match,
  -- Location 매칭
  CASE
    WHEN i.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)) THEN 'FLAT_EXACT_MATCH'
    WHEN i.type = 'rack' AND UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$') THEN 'RACK_PATTERN_MATCH'
    WHEN i.type = 'rack' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)) THEN 'RACK_EXACT_MATCH'
    ELSE 'NO_LOCATION_MATCH'
  END as location_match_type,
  -- 최종 매칭 결과
  CASE
    WHEN normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
         AND (
           (i.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)))
           OR (i.type = 'rack' AND (
               UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$')
               OR UPPER(TRIM(w.location)) = UPPER(TRIM(i.location))
           ))
         ) THEN 'SHOULD_MATCH'
    ELSE 'WONT_MATCH'
  END as final_match_result
FROM wms_raw_rows w
CROSS JOIN items i
JOIN layouts l ON l.id = i.layout_id
WHERE w.warehouse_code = l.warehouse_code
LIMIT 100;

-- ==============================================
-- Step 5b: Warehouse 코드 필터 없이 전체 로직 테스트
-- ==============================================
-- warehouse_code 필터 없이 모든 조합의 매칭 로직 테스트
SELECT
  w.location as wms_location,
  w.split_key,
  i.location as item_location,
  i.type,
  w.warehouse_code as wms_wh,
  l.warehouse_code as item_wh,
  -- Zone 매칭 (split_key vs items.location)
  normalize_zone_code(w.split_key) as split_key_norm,
  normalize_zone_code(i.location) as item_location_norm,
  normalize_zone_code(w.split_key) = normalize_zone_code(i.location) as zone_match,
  -- Location 매칭
  CASE
    WHEN i.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)) THEN 'FLAT_EXACT_MATCH'
    WHEN i.type = 'rack' AND UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$') THEN 'RACK_PATTERN_MATCH'
    WHEN i.type = 'rack' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)) THEN 'RACK_EXACT_MATCH'
    ELSE 'NO_LOCATION_MATCH'
  END as location_match_type,
  -- 최종 매칭 결과
  CASE
    WHEN normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
         AND (
           (i.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)))
           OR (i.type = 'rack' AND (
               UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$')
               OR UPPER(TRIM(w.location)) = UPPER(TRIM(i.location))
           ))
         ) THEN 'SHOULD_MATCH'
    ELSE 'WONT_MATCH'
  END as final_match_result
FROM wms_raw_rows w
CROSS JOIN items i
JOIN layouts l ON l.id = i.layout_id
WHERE normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
LIMIT 100;

-- ==============================================
-- Step 6: 실제 MV JOIN 결과 확인
-- ==============================================
-- location_inventory_summary_mv의 실제 JOIN 로직 테스트 (warehouse_code 필터링)
SELECT
  i.id as item_id,
  i.location as item_location,
  i.type,
  l.warehouse_code as item_wh,
  COUNT(w.id) as matching_wms_rows,
  COUNT(DISTINCT w.location) as unique_wms_locations,
  SUM(COALESCE(w.available_qty, 0))::NUMERIC as total_qty,
  -- 매칭된 WMS 데이터 샘플
  array_agg(DISTINCT w.location ORDER BY w.location) FILTER (WHERE w.id IS NOT NULL) as matched_locations,
  array_agg(DISTINCT w.split_key ORDER BY w.split_key) FILTER (WHERE w.id IS NOT NULL) as matched_split_keys
FROM items i
JOIN layouts l ON i.layout_id = l.id
LEFT JOIN wms_raw_rows w ON
  w.warehouse_code = l.warehouse_code
  AND normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
  AND (
    (i.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)))
    OR (i.type = 'rack' AND UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
  )
WHERE l.warehouse_code IS NOT NULL
GROUP BY i.id, i.location, i.type, l.warehouse_code
HAVING COUNT(w.id) > 0
ORDER BY COUNT(w.id) DESC
LIMIT 20;

-- ==============================================
-- Step 6b: Warehouse 코드 필터 없이 MV JOIN 결과 확인
-- ==============================================
-- warehouse_code 필터 없이 모든 조합의 JOIN 결과 테스트
SELECT
  i.id as item_id,
  i.location as item_location,
  i.type,
  l.warehouse_code as item_wh,
  COUNT(w.id) as matching_wms_rows,
  COUNT(DISTINCT w.location) as unique_wms_locations,
  SUM(COALESCE(w.available_qty, 0))::NUMERIC as total_qty,
  -- 매칭된 WMS 데이터 샘플
  array_agg(DISTINCT w.location ORDER BY w.location) FILTER (WHERE w.id IS NOT NULL) as matched_locations,
  array_agg(DISTINCT w.split_key ORDER BY w.split_key) FILTER (WHERE w.id IS NOT NULL) as matched_split_keys,
  array_agg(DISTINCT w.warehouse_code ORDER BY w.warehouse_code) FILTER (WHERE w.id IS NOT NULL) as matched_wh_codes
FROM items i
JOIN layouts l ON i.layout_id = l.id
LEFT JOIN wms_raw_rows w ON
  normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
  AND (
    (i.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)))
    OR (i.type = 'rack' AND UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
  )
WHERE l.warehouse_code IS NOT NULL
GROUP BY i.id, i.location, i.type, l.warehouse_code
HAVING COUNT(w.id) > 0
ORDER BY COUNT(w.id) DESC
LIMIT 20;

-- ==============================================
-- Step 7: 매칭 실패 분석
-- ==============================================
-- 어떤 item들이 매칭되지 않는지 확인 (warehouse_code 필터링)
SELECT
  i.id as item_id,
  i.location as item_location,
  i.type,
  l.warehouse_code,
  l.zone_name,
  -- WMS 데이터가 있는지 확인
  CASE
    WHEN EXISTS (
      SELECT 1 FROM wms_raw_rows w2
      WHERE w2.warehouse_code = l.warehouse_code
    ) THEN 'WMS_데이터_있음'
    ELSE 'WMS_데이터_없음'
  END as wms_data_status,
  -- Zone 매칭 가능한 WMS 데이터 수
  (
    SELECT COUNT(*)
    FROM wms_raw_rows w2
    WHERE w2.warehouse_code = l.warehouse_code
      AND normalize_zone_code(w2.split_key) = normalize_zone_code(i.location)
  ) as zone_matching_wms_count,
  -- Location 매칭 가능한 WMS 데이터 수
  (
    SELECT COUNT(*)
    FROM wms_raw_rows w2
    WHERE w2.warehouse_code = l.warehouse_code
      AND normalize_zone_code(w2.split_key) = normalize_zone_code(i.location)
      AND (
        (i.type = 'flat' AND UPPER(TRIM(w2.location)) = UPPER(TRIM(i.location)))
        OR (i.type = 'rack' AND UPPER(TRIM(w2.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
      )
  ) as location_matching_wms_count
FROM items i
JOIN layouts l ON i.layout_id = l.id
WHERE l.warehouse_code IS NOT NULL
ORDER BY location_matching_wms_count ASC, i.location
LIMIT 50;

-- ==============================================
-- Step 7b: Warehouse 코드 필터 없이 매칭 실패 분석
-- ==============================================
-- warehouse_code 필터 없이 모든 조합에서 매칭 실패 분석
SELECT
  i.id as item_id,
  i.location as item_location,
  i.type,
  l.warehouse_code as item_wh,
  -- Zone 매칭 가능한 WMS 데이터 수 (어디든)
  (
    SELECT COUNT(*)
    FROM wms_raw_rows w2
    WHERE normalize_zone_code(w2.split_key) = normalize_zone_code(i.location)
  ) as zone_matching_wms_count_anywhere,
  -- Location 매칭 가능한 WMS 데이터 수 (어디든)
  (
    SELECT COUNT(*)
    FROM wms_raw_rows w2
    WHERE normalize_zone_code(w2.split_key) = normalize_zone_code(i.location)
      AND (
        (i.type = 'flat' AND UPPER(TRIM(w2.location)) = UPPER(TRIM(i.location)))
        OR (i.type = 'rack' AND UPPER(TRIM(w2.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
      )
  ) as location_matching_wms_count_anywhere,
  -- 매칭되는 WMS 데이터의 warehouse 코드들
  (
    SELECT array_agg(DISTINCT w2.warehouse_code ORDER BY w2.warehouse_code)
    FROM wms_raw_rows w2
    WHERE normalize_zone_code(w2.split_key) = normalize_zone_code(i.location)
  ) as matching_wh_codes
FROM items i
JOIN layouts l ON i.layout_id = l.id
WHERE l.warehouse_code IS NOT NULL
ORDER BY location_matching_wms_count_anywhere ASC, i.location
LIMIT 50;

-- ==============================================
-- Step 8: 매칭 실패 원인 통계
-- ==============================================
-- warehouse_code 필터링 버전
SELECT
  CASE
    WHEN l.warehouse_code IS NULL THEN 'warehouse_code_null'
    WHEN NOT EXISTS (
      SELECT 1 FROM wms_raw_rows w
      WHERE w.warehouse_code = l.warehouse_code
    ) THEN 'no_wms_data_for_warehouse'
    WHEN NOT EXISTS (
      SELECT 1 FROM wms_raw_rows w
      WHERE w.warehouse_code = l.warehouse_code
        AND normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
    ) THEN 'no_split_key_match'
    WHEN EXISTS (
      SELECT 1 FROM wms_raw_rows w
      WHERE w.warehouse_code = l.warehouse_code
        AND normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
    ) AND NOT EXISTS (
      SELECT 1 FROM wms_raw_rows w
      WHERE w.warehouse_code = l.warehouse_code
        AND normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
        AND (
          (i.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)))
          OR (i.type = 'rack' AND UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
        )
    ) THEN 'split_key_match_but_no_location_match'
    ELSE 'should_match_but_logic_error'
  END as failure_reason,
  COUNT(*) as item_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM items i
JOIN layouts l ON i.layout_id = l.id
WHERE l.warehouse_code IS NOT NULL
GROUP BY
  CASE
    WHEN l.warehouse_code IS NULL THEN 'warehouse_code_null'
    WHEN NOT EXISTS (
      SELECT 1 FROM wms_raw_rows w
      WHERE w.warehouse_code = l.warehouse_code
    ) THEN 'no_wms_data_for_warehouse'
    WHEN NOT EXISTS (
      SELECT 1 FROM wms_raw_rows w
      WHERE w.warehouse_code = l.warehouse_code
        AND normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
    ) THEN 'no_split_key_match'
    WHEN EXISTS (
      SELECT 1 FROM wms_raw_rows w
      WHERE w.warehouse_code = l.warehouse_code
        AND normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
    ) AND NOT EXISTS (
      SELECT 1 FROM wms_raw_rows w
      WHERE w.warehouse_code = l.warehouse_code
        AND normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
        AND (
          (i.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)))
          OR (i.type = 'rack' AND UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
        )
    ) THEN 'split_key_match_but_no_location_match'
    ELSE 'should_match_but_logic_error'
  END
ORDER BY item_count DESC;

-- ==============================================
-- Step 8b: Warehouse 코드 필터 없이 매칭 실패 통계
-- ==============================================
-- warehouse_code 필터링 없이 전체 분석
SELECT
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM wms_raw_rows w
      WHERE normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
    ) THEN 'no_split_key_match_anywhere'
    WHEN EXISTS (
      SELECT 1 FROM wms_raw_rows w
      WHERE normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
    ) AND NOT EXISTS (
      SELECT 1 FROM wms_raw_rows w
      WHERE normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
        AND (
          (i.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)))
          OR (i.type = 'rack' AND UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
        )
    ) THEN 'split_key_match_but_no_location_match'
    ELSE 'should_match_but_logic_error'
  END as failure_reason,
  COUNT(*) as item_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM items i
JOIN layouts l ON i.layout_id = l.id
WHERE l.warehouse_code IS NOT NULL
GROUP BY
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM wms_raw_rows w
      WHERE normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
    ) THEN 'no_split_key_match_anywhere'
    WHEN EXISTS (
      SELECT 1 FROM wms_raw_rows w
      WHERE normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
    ) AND NOT EXISTS (
      SELECT 1 FROM wms_raw_rows w
      WHERE normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
        AND (
          (i.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)))
          OR (i.type = 'rack' AND UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
        )
    ) THEN 'split_key_match_but_no_location_match'
    ELSE 'should_match_but_logic_error'
  END
ORDER BY item_count DESC;

-- ==============================================
-- 실행 가이드
-- ==============================================
-- 1. Step 1부터 순서대로 실행 (warehouse_code 필터링 버전)
-- 2. 각 단계의 결과를 확인
-- 3. Step 8에서 어떤 문제가 가장 많은지 확인
-- 4. 문제가 "no_wms_data_for_warehouse"이면 → WMS 데이터가 해당 warehouse에 없는 것
-- 5. 문제가 "no_split_key_match"이면 → split_key와 items.location이 일치하지 않는 것
-- 6. 문제가 "split_key_match_but_no_location_match"이면 → zone은 맞지만 location 매칭이 안 되는 것
-- 7. Step 4와 5에서 구체적인 불일치 사례를 확인
-- 8. Step 6에서 실제 매칭되는 데이터가 있는지 확인
--
-- **추가 디버깅 (warehouse_code 필터링 제거):**
-- 9. Step 4b, 5b, 6b, 7b, 8b 실행해서 warehouse_code가 다른데도 매칭되는지 확인
-- 10. 만약 b버전에서 더 많은 매칭이 나오면 warehouse_code 필터링을 제거하는 것도 고려
