-- Debug queries for raw_rows table

-- 1. Check total count of raw_rows
SELECT COUNT(*) as total_rows FROM public.raw_rows;

-- 2. Check unique warehouse codes in raw_rows
SELECT DISTINCT warehouse_code, COUNT(*) as row_count
FROM public.raw_rows
GROUP BY warehouse_code
ORDER BY row_count DESC;

-- 3. Check your warehouses table codes
SELECT code, name, uses_wms, uses_sap
FROM public.warehouses
ORDER BY code;

-- 4. Check source types distribution
SELECT warehouse_code, source_type, COUNT(*) as count
FROM public.raw_rows
GROUP BY warehouse_code, source_type
ORDER BY warehouse_code, source_type;

-- 5. Sample data from raw_rows (first 10 rows)
SELECT 
    id,
    warehouse_code,
    source_type,
    item_code,
    zone,
    location,
    split_key,
    available_qty,
    total_qty
FROM public.raw_rows
LIMIT 10;

-- 6. Check if warehouse_code matches between tables
SELECT 
    w.code as warehouse_code,
    COUNT(r.id) as raw_rows_count
FROM public.warehouses w
LEFT JOIN public.raw_rows r ON r.warehouse_code = w.code
GROUP BY w.code
ORDER BY w.code;
