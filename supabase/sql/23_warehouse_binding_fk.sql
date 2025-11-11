-- Add foreign key constraint to warehouse_bindings
-- This ensures warehouse_code references warehouses.code
-- and automatically updates/deletes when warehouse code changes

-- First, add a foreign key constraint
-- Note: We reference warehouses.code (not id) because warehouse_code is a TEXT field
-- We need to ensure warehouses.code has a unique constraint first (already exists)

-- Add foreign key with CASCADE
ALTER TABLE public.warehouse_bindings
  DROP CONSTRAINT IF EXISTS fk_warehouse_bindings_code;

ALTER TABLE public.warehouse_bindings
  ADD CONSTRAINT fk_warehouse_bindings_code
  FOREIGN KEY (warehouse_code) 
  REFERENCES public.warehouses(code)
  ON UPDATE CASCADE   -- ✅ warehouse.code 변경 시 자동 업데이트!
  ON DELETE CASCADE;  -- ✅ warehouse 삭제 시 binding도 자동 삭제!

-- Similarly, update raw_rows to cascade
ALTER TABLE public.raw_rows
  DROP CONSTRAINT IF EXISTS fk_raw_rows_warehouse_code;

ALTER TABLE public.raw_rows
  ADD CONSTRAINT fk_raw_rows_warehouse_code
  FOREIGN KEY (warehouse_code)
  REFERENCES public.warehouses(code)
  ON UPDATE CASCADE   -- ✅ warehouse.code 변경 시 raw_rows도 자동 업데이트!
  ON DELETE CASCADE;  -- ✅ warehouse 삭제 시 raw_rows도 자동 삭제!

-- Add comment
COMMENT ON CONSTRAINT fk_warehouse_bindings_code ON public.warehouse_bindings IS 
  'Ensures warehouse_code references valid warehouses.code and cascades updates/deletes';

COMMENT ON CONSTRAINT fk_raw_rows_warehouse_code ON public.raw_rows IS 
  'Ensures warehouse_code references valid warehouses.code and cascades updates/deletes';
