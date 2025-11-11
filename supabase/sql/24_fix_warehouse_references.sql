-- Fix: Replace warehouse_code with warehouse_id in warehouse_bindings
-- This eliminates data duplication and uses proper foreign key relationships

-- Step 1: Add warehouse_id column to warehouse_bindings (allow NULL initially)
ALTER TABLE public.warehouse_bindings
  ADD COLUMN IF NOT EXISTS warehouse_id UUID;

-- Step 2: Populate warehouse_id from warehouse_code
UPDATE public.warehouse_bindings wb
SET warehouse_id = w.id
FROM public.warehouses w
WHERE wb.warehouse_code = w.code;

-- Step 2.5: Check for orphaned bindings (warehouse_code not in warehouses table)
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM public.warehouse_bindings
  WHERE warehouse_id IS NULL;
  
  IF orphan_count > 0 THEN
    RAISE NOTICE 'Found % orphaned warehouse_bindings (warehouse_code not found in warehouses)', orphan_count;
    RAISE NOTICE 'Deleting orphaned bindings...';
    
    DELETE FROM public.warehouse_bindings
    WHERE warehouse_id IS NULL;
    
    RAISE NOTICE 'Orphaned bindings deleted';
  ELSE
    RAISE NOTICE 'No orphaned bindings found';
  END IF;
END $$;

-- Step 3: Add foreign key constraint
ALTER TABLE public.warehouse_bindings
  DROP CONSTRAINT IF EXISTS fk_warehouse_bindings_warehouse_id;

ALTER TABLE public.warehouse_bindings
  ADD CONSTRAINT fk_warehouse_bindings_warehouse_id
  FOREIGN KEY (warehouse_id)
  REFERENCES public.warehouses(id)
  ON DELETE CASCADE;  -- Warehouse 삭제 시 binding도 삭제

-- Step 4: Make warehouse_id NOT NULL and UNIQUE
ALTER TABLE public.warehouse_bindings
  ALTER COLUMN warehouse_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_bindings_warehouse_id
  ON public.warehouse_bindings(warehouse_id);

-- Step 5: Drop deprecated columns (no longer needed!)
-- warehouse_code: redundant - use warehouse_id + JOIN to get code
-- wms_source_ids, sap_source_ids: replaced by source_bindings JSONB
ALTER TABLE public.warehouse_bindings 
  DROP COLUMN IF EXISTS warehouse_code,
  DROP COLUMN IF EXISTS wms_source_ids,
  DROP COLUMN IF EXISTS sap_source_ids;

-- Step 6: Create helper function to get bindings by warehouse_id
CREATE OR REPLACE FUNCTION get_warehouse_binding_by_id(p_warehouse_id UUID)
RETURNS TABLE (
  id UUID,
  warehouse_id UUID,
  warehouse_code TEXT,  -- Return code for convenience
  source_bindings JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wb.id,
    wb.warehouse_id,
    w.code AS warehouse_code,  -- Get code from warehouses table
    wb.source_bindings,
    wb.created_at,
    wb.updated_at
  FROM public.warehouse_bindings wb
  JOIN public.warehouses w ON w.id = wb.warehouse_id
  WHERE wb.warehouse_id = p_warehouse_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Update existing helper function
-- Drop old function first (signature changed)
DROP FUNCTION IF EXISTS get_warehouse_sources(TEXT);

CREATE OR REPLACE FUNCTION get_warehouse_sources(p_warehouse_code TEXT)
RETURNS TABLE (
  source_id UUID,
  source_type TEXT,
  split_value TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (key)::UUID AS source_id,
    (value->>'type')::TEXT AS source_type,
    (value->>'split_value')::TEXT AS split_value
  FROM public.warehouse_bindings wb
  JOIN public.warehouses w ON w.id = wb.warehouse_id  -- Use warehouse_id
  CROSS JOIN jsonb_each(wb.source_bindings)
  WHERE w.code = p_warehouse_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN public.warehouse_bindings.warehouse_id IS 
  'Foreign key to warehouses.id (immutable surrogate key)';

COMMENT ON FUNCTION get_warehouse_binding_by_id(UUID) IS 
  'Get warehouse binding by warehouse ID (preferred method)';
