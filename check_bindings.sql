
-- Check warehouse_bindings data
SELECT 
  wb.warehouse_id,
  w.code as warehouse_code,
  wb.source_bindings
FROM warehouse_bindings wb
JOIN warehouses w ON wb.warehouse_id = w.id;

