
-- 현재 시스템의 warehouse와 source 현황 파악

-- 1. Warehouse 목록
SELECT id, code, name FROM warehouses ORDER BY code;

-- 2. Sheet sources 목록  
SELECT id, label, type FROM sheet_sources WHERE type IN ('wms', 'sap') ORDER BY type, label;

-- 3. 현재 warehouse_bindings 상태
SELECT 
  wb.id,
  w.code as warehouse_code,
  wb.source_bindings
FROM warehouse_bindings wb
JOIN warehouses w ON wb.warehouse_id = w.id;

-- 4. 최근 WMS 데이터의 source 분포
SELECT source_id, COUNT(*) as count 
FROM wms_raw_rows 
WHERE fetched_at > NOW() - INTERVAL '24 hours'
GROUP BY source_id 
ORDER BY count DESC;

