-- ============================================
-- Zone Capacities MV 디버깅 쿼리
-- ============================================

-- 1. zones와 items 확인
SELECT
  z.id,
  z.code AS zone_code,
  z.warehouse_id,
  wh.code AS warehouse_code,
  COUNT(DISTINCT i.id) AS item_count,
  COALESCE(SUM(i.max_capacity), 0) AS total_max_capacity,
  array_agg(DISTINCT i.location) FILTER (WHERE i.location IS NOT NULL) AS zone_locations
FROM public.zones z
LEFT JOIN public.warehouses wh ON z.warehouse_id = wh.id
LEFT JOIN public.items i ON i.zone_id = z.id
GROUP BY z.id, z.code, z.warehouse_id, wh.code
ORDER BY z.code
LIMIT 10;

-- 2. WMS raw data 샘플 확인
SELECT
  id,
  zone_cd,
  split_key,
  cell_no,
  item_code,
  available_qty,
  -- zone_cd와 split_key가 같은지 확인
  normalize_zone_code(zone_cd) = normalize_zone_code(split_key) AS zone_split_match
FROM public.wms_raw_rows
WHERE zone_cd IS NOT NULL AND cell_no IS NOT NULL
LIMIT 20;

-- 3. Zone 매칭 조건 테스트 (현재 로직)
SELECT
  w.id,
  w.zone_cd,
  w.split_key,
  w.cell_no,
  normalize_zone_code(w.zone_cd) AS normalized_zone_cd,
  normalize_zone_code(w.split_key) AS normalized_split_key,
  normalize_zone_code(w.zone_cd) = normalize_zone_code(w.split_key) AS matches
FROM public.wms_raw_rows w
WHERE w.zone_cd IS NOT NULL
LIMIT 20;

-- 4. Zone별 WMS 매칭 결과 확인
WITH zone_layout_capacity AS (
  SELECT
    z.id AS zone_id,
    z.code AS zone_code,
    array_agg(DISTINCT i.location) FILTER (WHERE i.location IS NOT NULL) AS zone_locations
  FROM public.zones z
  LEFT JOIN public.items i ON i.zone_id = z.id
  GROUP BY z.id, z.code
)
SELECT
  zlc.zone_code,
  zlc.zone_locations,
  COUNT(DISTINCT w.id) AS wms_matched_rows,
  array_agg(DISTINCT w.zone_cd) AS matched_zone_cds,
  array_agg(DISTINCT w.split_key) AS matched_split_keys
FROM zone_layout_capacity zlc
LEFT JOIN public.wms_raw_rows w ON
  EXISTS (
    SELECT 1
    FROM public.zones z
    WHERE normalize_zone_code(w.zone_cd) = normalize_zone_code(w.split_key)
      AND z.id = zlc.zone_id
  )
  AND EXISTS (
    SELECT 1
    FROM unnest(zlc.zone_locations) AS item_location
    WHERE
      UPPER(TRIM(w.cell_no)) = UPPER(TRIM(item_location))
      OR
      UPPER(TRIM(w.cell_no)) LIKE UPPER(TRIM(item_location)) || '-%'
  )
GROUP BY zlc.zone_code, zlc.zone_locations
ORDER BY zlc.zone_code
LIMIT 10;

-- 5. 현재 zone_capacities_mv 결과 확인
SELECT
  zone_code,
  warehouse_code,
  item_count,
  max_capacity,
  current_stock,
  utilization_percentage,
  capacity_status,
  last_updated
FROM public.zone_capacities_mv
ORDER BY zone_code
LIMIT 10;
