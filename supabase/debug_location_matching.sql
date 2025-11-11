-- ============================================
-- LOCATION MATCHING DEBUG QUERIES
-- location_inventory_summary_mv 매칭 디버깅
-- ============================================

-- ============================================
-- 1. 기본 데이터 확인
-- ============================================

-- Items 테이블 샘플
SELECT id, location, item_code, zone, max_capacity
FROM public.items
LIMIT 10;

-- WMS Raw Rows 샘플 (location 관련)
SELECT id, cell_no, location, item_code, available_qty, lot_key
FROM public.wms_raw_rows
WHERE cell_no IS NOT NULL OR location IS NOT NULL
LIMIT 10;

-- ============================================
-- 2. 매칭 조건 분석
-- ============================================

-- 현재 JOIN 조건 테스트
SELECT
  i.id as item_id,
  i.location as item_location,
  i.item_code as item_code,
  w.id as wms_id,
  w.cell_no as wms_cell_no,
  w.item_code as wms_item_code,
  w.available_qty,
  w.lot_key
FROM public.items i
LEFT JOIN public.wms_raw_rows w ON w.cell_no = i.location
ORDER BY i.location, i.item_code
LIMIT 20;

-- ============================================
-- 3. 매칭 성공/실패 분석
-- ============================================

-- 매칭되는 items 레코드
SELECT
  COUNT(*) as matched_items,
  COUNT(DISTINCT i.location) as matched_locations,
  COUNT(DISTINCT i.item_code) as matched_item_codes
FROM public.items i
INNER JOIN public.wms_raw_rows w ON w.cell_no = i.location;

-- 매칭되지 않는 items 레코드
SELECT
  i.id,
  i.location,
  i.item_code,
  i.max_capacity
FROM public.items i
LEFT JOIN public.wms_raw_rows w ON w.cell_no = i.location
WHERE w.id IS NULL
ORDER BY i.location, i.item_code
LIMIT 20;

-- 매칭되지 않는 WMS 레코드 (고아 레코드)
SELECT
  w.id,
  w.cell_no,
  w.item_code,
  w.available_qty
FROM public.wms_raw_rows w
LEFT JOIN public.items i ON i.location = w.cell_no
WHERE i.id IS NULL
ORDER BY w.cell_no, w.item_code
LIMIT 20;

-- ============================================
-- 4. 위치별 상세 분석
-- ============================================

-- 특정 위치의 상세 매칭 현황
SELECT
  'LOCATION_ANALYSIS' as analysis_type,
  i.location,
  COUNT(DISTINCT i.id) as items_in_location,
  COUNT(DISTINCT w.id) as wms_records_in_location,
  COALESCE(SUM(w.available_qty), 0) as total_available_qty,
  COUNT(DISTINCT w.lot_key) as unique_lots
FROM public.items i
LEFT JOIN public.wms_raw_rows w ON w.cell_no = i.location
GROUP BY i.location
ORDER BY i.location
LIMIT 20;

-- ============================================
-- 5. MV 결과 확인
-- ============================================

-- MV 현재 상태
SELECT
  COUNT(*) as total_records,
  COUNT(DISTINCT item_location) as unique_locations,
  COUNT(DISTINCT item_code) as unique_items,
  SUM(total_available_qty) as total_inventory,
  AVG(lot_count) as avg_lot_count
FROM public.location_inventory_summary_mv;

-- MV 샘플 데이터
SELECT
  item_location,
  item_code,
  total_available_qty,
  lot_count,
  max_capacity,
  stock_status
FROM public.location_inventory_summary_mv
ORDER BY item_location, item_code
LIMIT 20;

-- ============================================
-- 6. 데이터 불일치 분석
-- ============================================

-- stock_status 계산 검증
SELECT
  item_location,
  item_code,
  total_available_qty,
  max_capacity,
  CASE
    WHEN total_available_qty = 0 THEN 'EMPTY'
    WHEN total_available_qty < (max_capacity * 0.1) THEN 'LOW_STOCK'
    WHEN total_available_qty > (max_capacity * 0.9) THEN 'OVER_STOCK'
    ELSE 'NORMAL'
  END as calculated_status,
  stock_status as mv_status,
  CASE WHEN stock_status = CASE
    WHEN total_available_qty = 0 THEN 'EMPTY'
    WHEN total_available_qty < (max_capacity * 0.1) THEN 'LOW_STOCK'
    WHEN total_available_qty > (max_capacity * 0.9) THEN 'OVER_STOCK'
    ELSE 'NORMAL'
  END THEN 'MATCH' ELSE 'MISMATCH' END as status_check
FROM public.location_inventory_summary_mv
WHERE max_capacity > 0
ORDER BY item_location, item_code
LIMIT 20;

-- ============================================
-- 7. 문제 해결을 위한 추가 쿼리
-- ============================================

-- cell_no vs location 칼럼 비교
SELECT
  'COLUMN_COMPARISON' as analysis,
  COUNT(*) as total_wms_records,
  COUNT(CASE WHEN cell_no IS NOT NULL THEN 1 END) as has_cell_no,
  COUNT(CASE WHEN location IS NOT NULL THEN 1 END) as has_location,
  COUNT(CASE WHEN cell_no = location THEN 1 END) as matching_values,
  COUNT(CASE WHEN cell_no IS NOT NULL AND location IS NOT NULL AND cell_no != location THEN 1 END) as different_values
FROM public.wms_raw_rows;

-- Items location 값들 확인
SELECT
  'ITEMS_LOCATION_ANALYSIS' as analysis,
  COUNT(DISTINCT location) as unique_locations,
  array_agg(DISTINCT location ORDER BY location) as location_samples
FROM public.items
WHERE location IS NOT NULL;

-- WMS cell_no 값들 확인
SELECT
  'WMS_CELL_NO_ANALYSIS' as analysis,
  COUNT(DISTINCT cell_no) as unique_cell_nos,
  array_agg(DISTINCT cell_no ORDER BY cell_no) as cell_no_samples
FROM public.wms_raw_rows
WHERE cell_no IS NOT NULL;

-- ============================================
-- 8. CTE별 디버깅 (lot_count 문제 분석)
-- ============================================

-- item_lot_distribution CTE 결과 확인
WITH item_lot_distribution AS (
  SELECT
    i.id as item_id,
    i.zone_id,
    i.location as item_location,
    w.item_code,
    w.lot_key,
    w.available_qty,
    w.tot_qty,
    w.inb_date,
    w.valid_date,
    w.prod_date,
    w.batch_id,
    w.split_key,
    ROW_NUMBER() OVER (
      PARTITION BY i.id, w.lot_key
      ORDER BY w.fetched_at DESC
    ) as rn
  FROM public.items i
  LEFT JOIN public.wms_raw_rows w ON
    w.cell_no = i.location
    AND w.available_qty > 0
)
SELECT
  item_id,
  item_location,
  item_code,
  lot_key,
  available_qty,
  rn
FROM item_lot_distribution
WHERE rn = 1
ORDER BY item_location, item_code, lot_key
LIMIT 20;

-- item_material_aggregation CTE 결과 확인
WITH item_lot_distribution AS (
  SELECT
    i.id as item_id,
    i.zone_id,
    i.location as item_location,
    w.item_code,
    w.lot_key,
    w.available_qty,
    w.tot_qty,
    w.inb_date,
    w.valid_date,
    w.prod_date,
    w.batch_id,
    w.split_key,
    ROW_NUMBER() OVER (
      PARTITION BY i.id, w.lot_key
      ORDER BY w.fetched_at DESC
    ) as rn
  FROM public.items i
  LEFT JOIN public.wms_raw_rows w ON
    w.cell_no = i.location
    AND w.available_qty > 0
),
item_material_aggregation AS (
  SELECT
    item_id,
    zone_id,
    item_location,
    item_code,
    SUM(available_qty) as total_available_qty,
    SUM(tot_qty) as total_qty,
    COUNT(DISTINCT lot_key) as lot_count,
    COUNT(*) as total_records,
    jsonb_agg(
      jsonb_build_object(
        'lot_key', lot_key,
        'available_qty', available_qty,
        'total_qty', tot_qty,
        'inb_date', inb_date,
        'valid_date', valid_date,
        'prod_date', prod_date,
        'batch_id', batch_id
      )
    ) as lots_info
  FROM item_lot_distribution
  WHERE rn = 1
  GROUP BY item_id, zone_id, item_location, item_code
)
SELECT
  item_id,
  item_location,
  item_code,
  total_available_qty,
  total_qty,
  lot_count,
  total_records,
  jsonb_array_length(lots_info) as lots_info_length
FROM item_material_aggregation
ORDER BY item_location, item_code
LIMIT 20;

-- lot_key 값 분석
WITH item_lot_distribution AS (
  SELECT
    i.id as item_id,
    i.location as item_location,
    w.item_code,
    w.lot_key,
    w.available_qty,
    ROW_NUMBER() OVER (
      PARTITION BY i.id, w.lot_key
      ORDER BY w.fetched_at DESC
    ) as rn
  FROM public.items i
  LEFT JOIN public.wms_raw_rows w ON
    w.cell_no = i.location
    AND w.available_qty > 0
)
SELECT
  item_location,
  item_code,
  lot_key,
  COUNT(*) as record_count,
  SUM(available_qty) as total_qty
FROM item_lot_distribution
WHERE rn = 1
  AND lot_key IS NOT NULL
GROUP BY item_location, item_code, lot_key
ORDER BY item_location, item_code, lot_key
LIMIT 20;

-- NULL lot_key 분석
WITH item_lot_distribution AS (
  SELECT
    i.id as item_id,
    i.location as item_location,
    w.item_code,
    w.lot_key,
    w.available_qty,
    ROW_NUMBER() OVER (
      PARTITION BY i.id, w.lot_key
      ORDER BY w.fetched_at DESC
    ) as rn
  FROM public.items i
  LEFT JOIN public.wms_raw_rows w ON
    w.cell_no = i.location
    AND w.available_qty > 0
)
SELECT
  'NULL_LOT_KEY_ANALYSIS' as analysis,
  COUNT(*) as total_records_with_null_lot_key,
  COUNT(DISTINCT item_id) as items_with_null_lot_key,
  SUM(available_qty) as total_qty_with_null_lot_key
FROM item_lot_distribution
WHERE rn = 1
  AND lot_key IS NULL;

-- ============================================
-- 9. WMS Lot 관련 칼럼 분석
-- ============================================

-- WMS 데이터의 모든 lot 관련 칼럼 값 확인
SELECT
  'WMS_LOT_COLUMNS_ANALYSIS' as analysis,
  COUNT(*) as total_wms_records,
  COUNT(CASE WHEN lot_key IS NOT NULL THEN 1 END) as has_lot_key,
  COUNT(CASE WHEN production_lot_no IS NOT NULL THEN 1 END) as has_production_lot_no,
  COUNT(CASE WHEN lot_no IS NOT NULL THEN 1 END) as has_lot_no,
  COUNT(CASE WHEN lot_attr_1 IS NOT NULL THEN 1 END) as has_lot_attr_1,
  COUNT(CASE WHEN lot_attr_2 IS NOT NULL THEN 1 END) as has_lot_attr_2,
  COUNT(CASE WHEN lot_attr_3 IS NOT NULL THEN 1 END) as has_lot_attr_3,
  COUNT(CASE WHEN lot_attr_4 IS NOT NULL THEN 1 END) as has_lot_attr_4,
  COUNT(CASE WHEN lot_attr_5 IS NOT NULL THEN 1 END) as has_lot_attr_5,
  COUNT(CASE WHEN lot_attr_6 IS NOT NULL THEN 1 END) as has_lot_attr_6,
  COUNT(CASE WHEN batch_id IS NOT NULL THEN 1 END) as has_batch_id
FROM public.wms_raw_rows
WHERE available_qty > 0;

-- 각 lot 칼럼의 실제 값들 샘플
SELECT
  cell_no,
  item_code,
  lot_key,
  production_lot_no,
  lot_no,
  lot_attr_1,
  lot_attr_2,
  lot_attr_3,
  lot_attr_4,
  lot_attr_5,
  lot_attr_6,
  batch_id,
  available_qty
FROM public.wms_raw_rows
WHERE available_qty > 0
  AND (lot_key IS NOT NULL
    OR production_lot_no IS NOT NULL
    OR lot_no IS NOT NULL
    OR lot_attr_1 IS NOT NULL
    OR batch_id IS NOT NULL)
ORDER BY cell_no, item_code
LIMIT 20;

-- NULL이 아닌 lot 칼럼들의 고유 값들 확인
SELECT
  'PRODUCTION_LOT_NO_VALUES' as column_name,
  COUNT(DISTINCT production_lot_no) as unique_values,
  array_agg(DISTINCT production_lot_no) as sample_values
FROM public.wms_raw_rows
WHERE production_lot_no IS NOT NULL AND available_qty > 0
UNION ALL
SELECT
  'LOT_NO_VALUES' as column_name,
  COUNT(DISTINCT lot_no) as unique_values,
  array_agg(DISTINCT lot_no) as sample_values
FROM public.wms_raw_rows
WHERE lot_no IS NOT NULL AND available_qty > 0
UNION ALL
SELECT
  'LOT_ATTR_1_VALUES' as column_name,
  COUNT(DISTINCT lot_attr_1) as unique_values,
  array_agg(DISTINCT lot_attr_1) as sample_values
FROM public.wms_raw_rows
WHERE lot_attr_1 IS NOT NULL AND available_qty > 0
UNION ALL
SELECT
  'BATCH_ID_VALUES' as column_name,
  COUNT(DISTINCT batch_id) as unique_values,
  array_agg(DISTINCT batch_id) as sample_values
FROM public.wms_raw_rows
WHERE batch_id IS NOT NULL AND available_qty > 0;

-- 가능한 lot_key 대안들로 테스트
WITH test_lot_keys AS (
  SELECT
    i.location as item_location,
    w.item_code,
    -- 여러 가능한 lot_key 조합들 테스트
    COALESCE(w.lot_key, w.production_lot_no, w.lot_no, w.lot_attr_1, w.batch_id, 'NO_LOT_' || w.id::text) as potential_lot_key,
    w.available_qty,
    ROW_NUMBER() OVER (
      PARTITION BY i.id, COALESCE(w.lot_key, w.production_lot_no, w.lot_no, w.lot_attr_1, w.batch_id, 'NO_LOT_' || w.id::text)
      ORDER BY w.fetched_at DESC
    ) as rn
  FROM public.items i
  LEFT JOIN public.wms_raw_rows w ON
    w.cell_no = i.location
    AND w.available_qty > 0
)
SELECT
  item_location,
  item_code,
  potential_lot_key,
  COUNT(*) as records_per_lot,
  SUM(available_qty) as total_qty_per_lot
FROM test_lot_keys
WHERE rn = 1
GROUP BY item_location, item_code, potential_lot_key
ORDER BY item_location, item_code, potential_lot_key
LIMIT 20;

-- ============================================
-- USAGE INSTRUCTIONS
-- ============================================

/*
실행 순서:
1. 기본 데이터 확인 (섹션 1)
2. 매칭 조건 분석 (섹션 2)
3. 매칭 성공/실패 분석 (섹션 3)
4. 위치별 상세 분석 (섹션 4)
5. MV 결과 확인 (섹션 5)
6. 데이터 불일치 분석 (섹션 6)
7. CTE별 디버깅 (섹션 8) - lot_count 문제 분석

lot_count = 0 문제 해결:
- 섹션 8의 첫 번째 쿼리: item_lot_distribution CTE 결과 확인
- 섹션 8의 두 번째 쿼리: item_material_aggregation CTE 결과 확인
- 섹션 8의 세 번째 쿼리: 유효한 lot_key 값들 확인
- 섹션 8의 네 번째 쿼리: NULL lot_key 레코드 분석

문제 해결 팁:
- lot_key가 NULL: WMS 데이터에서 lot 정보가 누락됨
- ROW_NUMBER() PARTITION에 lot_key가 NULL: 같은 아이템의 모든 NULL lot_key가 rn=1로 처리됨
- COUNT(DISTINCT lot_key)에서 NULL은 제외됨
*/
