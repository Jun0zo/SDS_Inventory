-- Fix Material Category Triggers to Handle Missing MV
-- This prevents 500 errors when updating expected materials before MV is created

-- Drop existing trigger function
DROP FUNCTION IF EXISTS trigger_refresh_material_category_capacities() CASCADE;

-- Recreate trigger function with error handling
CREATE OR REPLACE FUNCTION trigger_refresh_material_category_capacities()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if materialized view exists before refreshing
  IF EXISTS (
    SELECT 1
    FROM pg_matviews
    WHERE schemaname = 'public'
    AND matviewname = 'mv_material_category_capacities'
  ) THEN
    BEGIN
      -- Try to refresh, but don't fail if it errors
      PERFORM refresh_material_category_capacities();
    EXCEPTION WHEN OTHERS THEN
      -- Log the error but don't fail the transaction
      RAISE WARNING 'Failed to refresh mv_material_category_capacities: %', SQLERRM;
    END;
  ELSE
    -- MV doesn't exist yet, skip refresh
    RAISE NOTICE 'Skipping mv_material_category_capacities refresh - view does not exist yet';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recreate all triggers
DROP TRIGGER IF EXISTS trigger_items_material_restrictions_refresh ON items;
CREATE TRIGGER trigger_items_material_restrictions_refresh
  AFTER UPDATE OF floor_material_restrictions, cell_material_restrictions, expected_major_category, expected_minor_category ON items
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_material_category_capacities();

DROP TRIGGER IF EXISTS trigger_items_capacity_refresh ON items;
CREATE TRIGGER trigger_items_capacity_refresh
  AFTER UPDATE OF cell_capacity, cell_availability, max_capacity ON items
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_material_category_capacities();

DROP TRIGGER IF EXISTS trigger_wms_material_capacities_refresh ON wms_raw_rows;
CREATE TRIGGER trigger_wms_material_capacities_refresh
  AFTER INSERT OR UPDATE OR DELETE ON wms_raw_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_material_category_capacities();

DROP TRIGGER IF EXISTS trigger_materials_capacities_refresh ON materials;
CREATE TRIGGER trigger_materials_capacities_refresh
  AFTER INSERT OR UPDATE OR DELETE ON materials
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_material_category_capacities();

COMMENT ON FUNCTION trigger_refresh_material_category_capacities IS
  'Trigger function that safely refreshes mv_material_category_capacities.
   Checks if MV exists before refreshing and handles errors gracefully.';

-- Test: Verify the function works
DO $$
BEGIN
  PERFORM trigger_refresh_material_category_capacities();
  RAISE NOTICE 'Trigger function test completed successfully';
END $$;
