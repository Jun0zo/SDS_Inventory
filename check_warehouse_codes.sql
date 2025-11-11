SELECT DISTINCT warehouse_code, COUNT(*) as count FROM wms_raw_rows GROUP BY warehouse_code ORDER BY count DESC LIMIT 10;
