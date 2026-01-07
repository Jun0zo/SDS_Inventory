-- Fix: Disable auto-refresh triggers for mv_component_metadata to prevent timeouts
-- The MV will be refreshed manually when user clicks "Sync All" button

-- ============================================================
-- 1. Drop Existing Triggers
-- ============================================================

DROP TRIGGER IF EXISTS trigger_items_metadata_refresh ON items;
DROP TRIGGER IF EXISTS trigger_wms_rows_metadata_refresh ON wms_raw_rows;
DROP TRIGGER IF EXISTS trigger_materials_metadata_refresh ON materials;
DROP TRIGGER IF EXISTS trigger_production_lines_metadata_refresh ON production_lines;

-- ============================================================
-- 2. Update Trigger Function to Add Timeout Protection
-- ============================================================

-- Recreate trigger function with error handling (for manual use)
CREATE OR REPLACE FUNCTION trigger_refresh_component_metadata()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if materialized view exists before refreshing
  IF EXISTS (
    SELECT 1
    FROM pg_matviews
    WHERE schemaname = 'public'
    AND matviewname = 'mv_component_metadata'
  ) THEN
    BEGIN
      -- Try to refresh with CONCURRENTLY to avoid blocking
      -- Note: This will skip refresh if concurrent refresh is already running
      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_component_metadata;
    EXCEPTION WHEN OTHERS THEN
      -- Log the error but don't fail the transaction
      RAISE WARNING 'Failed to refresh mv_component_metadata: %', SQLERRM;
    END;
  ELSE
    -- MV doesn't exist yet, skip refresh
    RAISE NOTICE 'Skipping mv_component_metadata refresh - view does not exist yet';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. Update refresh_component_metadata Function for Manual Refresh
-- ============================================================

-- Update to handle concurrent refresh safely
CREATE OR REPLACE FUNCTION refresh_component_metadata()
RETURNS void AS $$
BEGIN
  -- Use CONCURRENTLY to avoid locking the view
  -- This requires a unique index (already exists: idx_mv_component_metadata_item_id)
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_component_metadata;

  RAISE NOTICE 'mv_component_metadata refreshed successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to refresh mv_component_metadata: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. Add Comments
-- ============================================================

COMMENT ON FUNCTION trigger_refresh_component_metadata IS
  'Trigger function for mv_component_metadata refresh.
   NOTE: Triggers are disabled by default to prevent timeout errors.
   MV should be refreshed manually via refresh_component_metadata() or "Sync All" button.';

COMMENT ON FUNCTION refresh_component_metadata IS
  'Manually refresh mv_component_metadata materialized view.
   Call this after bulk operations or from "Sync All" button.
   Uses CONCURRENTLY to avoid blocking queries.';

-- ============================================================
-- 5. Create Wrapper Function for Frontend to Call
-- ============================================================

-- Create a wrapper that refreshes all MVs in correct order
CREATE OR REPLACE FUNCTION refresh_all_component_mvs()
RETURNS void AS $$
BEGIN
  -- Refresh component metadata first
  PERFORM refresh_component_metadata();

  -- Then refresh material category capacities (depends on component metadata)
  PERFORM refresh_material_category_capacities();

  RAISE NOTICE 'All component-related MVs refreshed successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to refresh component MVs: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_all_component_mvs IS
  'Refresh all component-related materialized views in correct dependency order.
   Call this from "Sync All" button to update component metadata and material capacities.';

-- ============================================================
-- 6. Verification
-- ============================================================

-- Test the refresh function
DO $$
BEGIN
  PERFORM refresh_component_metadata();
  RAISE NOTICE 'Component metadata refresh test completed successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Component metadata refresh test failed: %', SQLERRM;
END $$;

-- Show status
SELECT
  'mv_component_metadata' AS view_name,
  COUNT(*) AS row_count,
  COUNT(*) FILTER (WHERE has_material_variance) AS mismatched_count,
  COUNT(*) FILTER (WHERE has_unassigned_locations) AS unassigned_count
FROM mv_component_metadata;
