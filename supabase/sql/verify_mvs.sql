-- ============================================================================
-- Materialized Views Verification Script
-- ============================================================================
-- Purpose: Verify all MVs are created and accessible
-- Usage: Run this in Supabase SQL Editor after executing 00_execute_all_mvs.sql
-- ============================================================================

-- ========================================
-- 1. Check if all MVs exist
-- ========================================
SELECT
  'Materialized Views Status' AS check_name,
  COUNT(*) AS total_mvs,
  STRING_AGG(matviewname, ', ' ORDER BY matviewname) AS mv_names
FROM pg_matviews
WHERE schemaname = 'public' AND matviewname LIKE '%_mv';

-- Expected: 10 MVs
-- zone_capacities_mv, dashboard_inventory_stats_mv, inventory_discrepancies_mv,
-- wms_inventory_indexed_mv, sap_inventory_indexed_mv, location_inventory_summary_mv,
-- item_inventory_summary_mv, stock_status_distribution_mv, expiring_items_mv, slow_moving_items_mv

-- ========================================
-- 2. Detailed MV information
-- ========================================
SELECT
  matviewname,
  pg_size_pretty(pg_total_relation_size(matviewname::regclass)) AS size,
  (SELECT COUNT(*)
   FROM pg_class c
   JOIN pg_index i ON i.indrelid = c.oid
   WHERE c.relname = matviewname) AS index_count,
  matviewowner
FROM pg_matviews
WHERE schemaname = 'public' AND matviewname LIKE '%_mv'
ORDER BY matviewname;

-- ========================================
-- 3. Check permissions (must have authenticated and anon)
-- ========================================
SELECT
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name LIKE '%_mv'
  AND grantee IN ('authenticated', 'anon')
ORDER BY table_name, grantee;

-- Expected: Each MV should have SELECT for both authenticated and anon

-- ========================================
-- 4. Check functions exist
-- ========================================
SELECT
  'Functions Status' AS check_name,
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'normalize_zone_code',
    'refresh_all_materialized_views',
    'refresh_zone_capacities',
    'get_rack_inventory_summary'
  )
ORDER BY routine_name;

-- Expected: 4 functions

-- ========================================
-- 5. Zone aliases removed - using direct zone matching
-- ========================================

-- ========================================
-- 6. Sample data from each MV (verify data exists)
-- ========================================

-- 6.1 Zone Capacities MV
SELECT 'zone_capacities_mv' AS mv_name, COUNT(*) AS row_count
FROM public.zone_capacities_mv;

-- 6.2 Dashboard Inventory Stats MV
SELECT 'dashboard_inventory_stats_mv' AS mv_name, COUNT(*) AS row_count
FROM public.dashboard_inventory_stats_mv;

-- 6.3 Inventory Discrepancies MV
SELECT 'inventory_discrepancies_mv' AS mv_name, COUNT(*) AS row_count
FROM public.inventory_discrepancies_mv;

-- 6.4 WMS Inventory Indexed MV
SELECT 'wms_inventory_indexed_mv' AS mv_name, COUNT(*) AS row_count
FROM public.wms_inventory_indexed_mv;

-- 6.5 SAP Inventory Indexed MV
SELECT 'sap_inventory_indexed_mv' AS mv_name, COUNT(*) AS row_count
FROM public.sap_inventory_indexed_mv;

-- 6.6 Location Inventory Summary MV
SELECT 'location_inventory_summary_mv' AS mv_name, COUNT(*) AS row_count
FROM public.location_inventory_summary_mv;

-- 6.7 Item Inventory Summary MV
SELECT 'item_inventory_summary_mv' AS mv_name, COUNT(*) AS row_count
FROM public.item_inventory_summary_mv;

-- 6.8 Stock Status Distribution MV
SELECT 'stock_status_distribution_mv' AS mv_name, COUNT(*) AS row_count
FROM public.stock_status_distribution_mv;

-- 6.9 Expiring Items MV
SELECT 'expiring_items_mv' AS mv_name, COUNT(*) AS row_count
FROM public.expiring_items_mv;

-- 6.10 Slow Moving Items MV
SELECT 'slow_moving_items_mv' AS mv_name, COUNT(*) AS row_count
FROM public.slow_moving_items_mv;

-- ========================================
-- 7. Test warehouse-specific queries
-- ========================================

-- Test for EA2-F warehouse (adjust warehouse_code as needed)
SELECT
  'EA2-F Test' AS test_name,
  (SELECT COUNT(*) FROM zone_capacities_mv WHERE warehouse_code = 'EA2-F') AS zone_count,
  (SELECT total_wms_items FROM dashboard_inventory_stats_mv WHERE warehouse_code = 'EA2-F') AS wms_items,
  (SELECT COUNT(*) FROM location_inventory_summary_mv WHERE warehouse_code = 'EA2-F') AS locations;

-- ========================================
-- 8. Test the master refresh function
-- ========================================

-- This will refresh all MVs and return a detailed status
-- Comment out if you don't want to refresh now
-- SELECT refresh_all_materialized_views();

-- ========================================
-- 9. Check for any errors in recent refreshes
-- ========================================

-- If there were errors during refresh, they would appear in pg_stat_activity
-- or you can check the results from the refresh function above

-- ========================================
-- SUMMARY: Expected Results
-- ========================================

-- Check 1: 10 materialized views should exist
-- Check 2: Each MV should have a size and at least 1 index
-- Check 3: Each MV should have SELECT permissions for authenticated and anon
-- Check 4: 4 functions should exist
-- Check 5: Zone aliases removed - using direct zone matching
-- Check 6: Each MV should have data (row_count > 0) if source tables have data
-- Check 7: Warehouse-specific data should be retrievable
-- Check 8: refresh_all_materialized_views() should return success for all 10 views

-- ============================================================================
-- If any check fails, refer to TROUBLESHOOTING.md
-- ============================================================================
