-- Master Refresh Function for All Materialized Views
-- Purpose: Refresh all materialized views after data sync
-- Usage: Call this function after WMS/SAP data sync

-- Drop existing function if exists
DROP FUNCTION IF EXISTS public.refresh_all_materialized_views() CASCADE;

-- Create master refresh function
CREATE OR REPLACE FUNCTION public.refresh_all_materialized_views()
RETURNS jsonb AS $$
DECLARE
  v_start_time TIMESTAMP;
  v_end_time TIMESTAMP;
  v_result jsonb := '[]'::jsonb;
  v_error_count INTEGER := 0;
BEGIN
  v_start_time := clock_timestamp();

  RAISE NOTICE 'Starting refresh of all materialized views at %', v_start_time;

  -- 1. Zone Capacities MV
  BEGIN
    RAISE NOTICE '  Refreshing zone_capacities_mv...';
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.zone_capacities_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'zone_capacities_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ zone_capacities_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'zone_capacities_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ zone_capacities_mv refresh failed: %', SQLERRM;
  END;

  -- 2. Dashboard Inventory Stats MV
  BEGIN
    RAISE NOTICE '  Refreshing dashboard_inventory_stats_mv...';
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.dashboard_inventory_stats_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'dashboard_inventory_stats_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ dashboard_inventory_stats_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'dashboard_inventory_stats_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ dashboard_inventory_stats_mv refresh failed: %', SQLERRM;
  END;

  -- 3. Inventory Discrepancies MV (without CONCURRENTLY - no unique index due to LIMIT)
  BEGIN
    RAISE NOTICE '  Refreshing inventory_discrepancies_mv...';
    REFRESH MATERIALIZED VIEW public.inventory_discrepancies_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'inventory_discrepancies_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ inventory_discrepancies_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'inventory_discrepancies_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ inventory_discrepancies_mv refresh failed: %', SQLERRM;
  END;

  -- 4. WMS Inventory Indexed MV
  BEGIN
    RAISE NOTICE '  Refreshing wms_inventory_indexed_mv...';
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.wms_inventory_indexed_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'wms_inventory_indexed_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ wms_inventory_indexed_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'wms_inventory_indexed_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ wms_inventory_indexed_mv refresh failed: %', SQLERRM;
  END;

  -- 5. SAP Inventory Indexed MV
  BEGIN
    RAISE NOTICE '  Refreshing sap_inventory_indexed_mv...';
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.sap_inventory_indexed_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'sap_inventory_indexed_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ sap_inventory_indexed_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'sap_inventory_indexed_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ sap_inventory_indexed_mv refresh failed: %', SQLERRM;
  END;

  -- 6. Location Inventory Summary MV
  BEGIN
    RAISE NOTICE '  Refreshing location_inventory_summary_mv...';
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.location_inventory_summary_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'location_inventory_summary_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ location_inventory_summary_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'location_inventory_summary_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ location_inventory_summary_mv refresh failed: %', SQLERRM;
  END;

  -- 7. Item Inventory Summary MV
  BEGIN
    RAISE NOTICE '  Refreshing item_inventory_summary_mv...';
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.item_inventory_summary_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'item_inventory_summary_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ item_inventory_summary_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'item_inventory_summary_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ item_inventory_summary_mv refresh failed: %', SQLERRM;
  END;

  -- 8. Stock Status Distribution MV
  BEGIN
    RAISE NOTICE '  Refreshing stock_status_distribution_mv...';
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.stock_status_distribution_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'stock_status_distribution_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ stock_status_distribution_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'stock_status_distribution_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ stock_status_distribution_mv refresh failed: %', SQLERRM;
  END;

  -- 9. Expiring Items MV (without CONCURRENTLY - no unique index due to LIMIT)
  BEGIN
    RAISE NOTICE '  Refreshing expiring_items_mv...';
    REFRESH MATERIALIZED VIEW public.expiring_items_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'expiring_items_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ expiring_items_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'expiring_items_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ expiring_items_mv refresh failed: %', SQLERRM;
  END;

  -- 10. Slow Moving Items MV (without CONCURRENTLY - no unique index due to LIMIT)
  BEGIN
    RAISE NOTICE '  Refreshing slow_moving_items_mv...';
    REFRESH MATERIALIZED VIEW public.slow_moving_items_mv;
    v_result := v_result || jsonb_build_object(
      'view', 'slow_moving_items_mv',
      'status', 'success',
      'refreshed_at', clock_timestamp()
    );
    RAISE NOTICE '  ✓ slow_moving_items_mv refreshed successfully';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_result := v_result || jsonb_build_object(
      'view', 'slow_moving_items_mv',
      'status', 'error',
      'error', SQLERRM
    );
    RAISE WARNING '  ✗ slow_moving_items_mv refresh failed: %', SQLERRM;
  END;

  v_end_time := clock_timestamp();

  RAISE NOTICE 'Completed refresh of all materialized views at %', v_end_time;
  RAISE NOTICE 'Total time: % seconds', EXTRACT(EPOCH FROM (v_end_time - v_start_time));
  RAISE NOTICE 'Successful: % / %', (10 - v_error_count), 10;

  IF v_error_count > 0 THEN
    RAISE WARNING 'Failed: % materialized views', v_error_count;
  END IF;

  RETURN jsonb_build_object(
    'total_views', 10,
    'successful', 10 - v_error_count,
    'failed', v_error_count,
    'start_time', v_start_time,
    'end_time', v_end_time,
    'duration_seconds', EXTRACT(EPOCH FROM (v_end_time - v_start_time)),
    'details', v_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.refresh_all_materialized_views() TO authenticated;

-- Comments
COMMENT ON FUNCTION public.refresh_all_materialized_views() IS
  'Refreshes all materialized views used for dashboard and zone layout editor.
   Returns a JSON object with refresh status for each view.
   Call this function after WMS/SAP data sync.

   Views refreshed (in order):
   1. zone_capacities_mv
   2. dashboard_inventory_stats_mv
   3. inventory_discrepancies_mv
   4. wms_inventory_indexed_mv
   5. sap_inventory_indexed_mv
   6. location_inventory_summary_mv
   7. item_inventory_summary_mv
   8. stock_status_distribution_mv
   9. expiring_items_mv
   10. slow_moving_items_mv';

-- For backward compatibility, update refresh_zone_capacities to call the master function
DROP FUNCTION IF EXISTS public.refresh_zone_capacities() CASCADE;

CREATE OR REPLACE FUNCTION public.refresh_zone_capacities()
RETURNS void AS $$
DECLARE
  v_result jsonb;
BEGIN
  RAISE NOTICE 'Calling refresh_all_materialized_views()...';
  v_result := refresh_all_materialized_views();
  RAISE NOTICE 'Result: %', v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.refresh_zone_capacities() TO authenticated;

COMMENT ON FUNCTION public.refresh_zone_capacities() IS
  'Backward compatibility wrapper for refresh_all_materialized_views().
   Refreshes all materialized views, not just zone capacities.';
