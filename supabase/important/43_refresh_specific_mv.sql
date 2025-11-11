-- Function to refresh a specific materialized view
-- Purpose: Allow selective MV refresh for performance
-- Usage: SELECT refresh_specific_mv('location_inventory_summary_mv');

DROP FUNCTION IF EXISTS public.refresh_specific_mv(text) CASCADE;

CREATE OR REPLACE FUNCTION public.refresh_specific_mv(mv_name text)
RETURNS jsonb AS $$
DECLARE
  v_start_time TIMESTAMP;
  v_end_time TIMESTAMP;
  v_duration NUMERIC;
  v_sql TEXT;
BEGIN
  v_start_time := clock_timestamp();
  
  -- Validate MV name to prevent SQL injection
  IF mv_name NOT IN (
    'zone_capacities_mv',
    'dashboard_inventory_stats_mv',
    'inventory_discrepancies_mv',
    'wms_inventory_indexed_mv',
    'sap_inventory_indexed_mv',
    'location_inventory_summary_mv',
    'item_inventory_summary_mv',
    'stock_status_distribution_mv',
    'expiring_items_mv',
    'slow_moving_items_mv'
  ) THEN
    RAISE EXCEPTION 'Invalid materialized view name: %', mv_name;
  END IF;
  
  -- Build and execute refresh statement
  v_sql := format('REFRESH MATERIALIZED VIEW CONCURRENTLY public.%I', mv_name);
  EXECUTE v_sql;
  
  v_end_time := clock_timestamp();
  v_duration := EXTRACT(EPOCH FROM (v_end_time - v_start_time));
  
  RETURN jsonb_build_object(
    'view', mv_name,
    'status', 'success',
    'started_at', v_start_time,
    'completed_at', v_end_time,
    'duration_seconds', v_duration
  );
  
EXCEPTION WHEN OTHERS THEN
  v_end_time := clock_timestamp();
  v_duration := EXTRACT(EPOCH FROM (v_end_time - v_start_time));
  
  RETURN jsonb_build_object(
    'view', mv_name,
    'status', 'error',
    'error', SQLERRM,
    'started_at', v_start_time,
    'failed_at', v_end_time,
    'duration_seconds', v_duration
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.refresh_specific_mv(text) TO authenticated;

COMMENT ON FUNCTION public.refresh_specific_mv(text) IS
  'Refreshes a specific materialized view by name.
   
   Valid MV names:
   - zone_capacities_mv
   - dashboard_inventory_stats_mv
   - inventory_discrepancies_mv
   - wms_inventory_indexed_mv
   - sap_inventory_indexed_mv
   - location_inventory_summary_mv
   - item_inventory_summary_mv
   - stock_status_distribution_mv
   - expiring_items_mv
   - slow_moving_items_mv
   
   Example:
   SELECT refresh_specific_mv(''location_inventory_summary_mv'');
   
   Returns JSON with refresh status and duration.';
