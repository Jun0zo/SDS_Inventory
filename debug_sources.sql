
-- Check what sources exist in sheet_sources table
SELECT id, label, type FROM sheet_sources WHERE type IN ('wms', 'sap') ORDER BY type, id;

-- Check warehouse_bindings structure  
SELECT 
  wb.id,
  w.code as warehouse_code,
  wb.source_bindings
FROM warehouse_bindings wb
JOIN warehouses w ON wb.warehouse_id = w.id
ORDER BY w.code;

