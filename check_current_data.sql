
-- 현재 wms_raw_rows의 warehouse_code 분포 확인
SELECT warehouse_code, COUNT(*) as count 
FROM wms_raw_rows 
GROUP BY warehouse_code 
ORDER BY count DESC;

-- 최근 ingestion된 데이터 확인
SELECT source_id, warehouse_code, COUNT(*) as count 
FROM wms_raw_rows 
WHERE fetched_at > NOW() - INTERVAL '1 hour'
GROUP BY source_id, warehouse_code 
ORDER BY count DESC;

