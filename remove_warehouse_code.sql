
-- warehouse_code 컬럼 제거 마이그레이션

-- 1. wms_raw_rows에서 warehouse_code 컬럼 제거
ALTER TABLE wms_raw_rows DROP COLUMN IF EXISTS warehouse_code;

-- 2. sap_raw_rows에서 warehouse_code 컬럼 제거  
ALTER TABLE sap_raw_rows DROP COLUMN IF EXISTS warehouse_code;

-- 3. 관련 인덱스들도 제거 (있을 경우)
DROP INDEX IF EXISTS idx_wms_raw_rows_warehouse_code;
DROP INDEX IF EXISTS idx_sap_raw_rows_warehouse_code;

