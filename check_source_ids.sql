
-- 현재 sheet_sources의 ID와 label 확인
SELECT id, label, type, spreadsheet_id FROM sheet_sources WHERE type IN ('wms', 'sap') ORDER BY type, label;

-- 현재 warehouse_bindings의 source_bindings 확인
SELECT 
  w.code as warehouse_code,
  wb.source_bindings
FROM warehouse_bindings wb
JOIN warehouses w ON wb.warehouse_id = w.id;

