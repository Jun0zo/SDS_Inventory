
-- Warehouse Bindings 설정 예시
-- 실제 source_id와 warehouse_id를 확인한 후 실행하세요

-- 1. 현재 데이터 확인
SELECT 'Warehouses:' as info;
SELECT id, code, name FROM warehouses;

SELECT 'Sources:' as info;  
SELECT id, label, type FROM sheet_sources WHERE type IN ('wms', 'sap');

-- 2. 예시: source를 warehouse에 할당
-- 실제 실행 시 아래 주석을 해제하고 실제 ID로 변경하세요

/*
-- 예: sap_all source를 특정 warehouse에 할당
UPDATE warehouse_bindings 
SET source_bindings = jsonb_set(
  COALESCE(source_bindings, '{}'), 
  '{sap_all}', 
  '{type: sap}'
)
WHERE warehouse_id = (SELECT id FROM warehouses WHERE code = 'YOUR_WAREHOUSE_CODE');

-- 예: wms_lrn3 source를 특정 warehouse에 할당  
UPDATE warehouse_bindings 
SET source_bindings = jsonb_set(
  COALESCE(source_bindings, '{}'), 
  '{wms_lrn3}', 
  '{type: wms}'
)
WHERE warehouse_id = (SELECT id FROM warehouses WHERE code = 'YOUR_WAREHOUSE_CODE');
*/

SELECT 'Current bindings:' as info;
SELECT 
  w.code as warehouse,
  wb.source_bindings
FROM warehouse_bindings wb
JOIN warehouses w ON wb.warehouse_id = w.id;

