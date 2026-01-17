-- Disable material category triggers to prevent timeout errors
-- The MV will be refreshed manually when user clicks "Sync All" button or "Save Layout"

-- ============================================================
-- 1. Drop Triggers That Cause Timeout
-- ============================================================

-- These triggers refresh mv_material_category_capacities on every update
-- which causes timeout errors due to the MV refresh taking too long
DROP TRIGGER IF EXISTS trigger_items_material_restrictions_refresh ON items;
DROP TRIGGER IF EXISTS trigger_items_capacity_refresh ON items;

-- Keep wms_raw_rows and materials triggers commented out for now
-- They only fire on bulk operations which is less frequent
-- DROP TRIGGER IF EXISTS trigger_wms_material_capacities_refresh ON wms_raw_rows;
-- DROP TRIGGER IF EXISTS trigger_materials_capacities_refresh ON materials;

-- ============================================================
-- 2. Verify Triggers Are Removed
-- ============================================================

DO $$
DECLARE
  trigger_count INT;
BEGIN
  SELECT COUNT(*)
  INTO trigger_count
  FROM pg_trigger
  WHERE tgrelid = 'items'::regclass
    AND tgname IN ('trigger_items_material_restrictions_refresh', 'trigger_items_capacity_refresh');

  IF trigger_count = 0 THEN
    RAISE NOTICE 'Material triggers successfully removed from items table';
  ELSE
    RAISE WARNING 'Some triggers still exist on items table: %', trigger_count;
  END IF;
END $$;

-- ============================================================
-- 3. Show Remaining Triggers on Items Table
-- ============================================================

SELECT
  tgname AS trigger_name,
  tgtype AS trigger_type,
  tgenabled AS enabled
FROM pg_trigger
WHERE tgrelid = 'items'::regclass
  AND NOT tgisinternal;
