
-- ============================================
-- DATABASE RESET SCRIPT - Complete Cleanup
-- 모든 테이블, 인덱스, 함수를 제거합니다
-- ============================================

-- ============================================
-- 1. MATERIALIZED VIEWS 제거 (먼저 제거해야 함)
-- ============================================
DROP MATERIALIZED VIEW IF EXISTS public.location_inventory_summary_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.item_inventory_summary_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.zone_capacities_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.dashboard_inventory_stats_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.inventory_discrepancies_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.wms_inventory_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.sap_inventory_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.expiring_items_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.slow_moving_items_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.stock_status_distribution_mv CASCADE;

-- ============================================
-- 2. TRIGGERS 제거
-- ============================================
DROP TRIGGER IF EXISTS trigger_create_zone_aliases ON public.zones;

-- ============================================
-- 3. FUNCTIONS 제거 (CASCADE로 의존 객체 함께 제거)
-- ============================================
DROP FUNCTION IF EXISTS public.create_zone_aliases() CASCADE;
DROP FUNCTION IF EXISTS public.find_zone_by_alias(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.normalize_zone_code(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.refresh_all_materialized_views() CASCADE;

-- ============================================
-- 4. TABLES 제거 (참조 관계 역순)
-- ============================================
-- 먼저 명시적으로 제거해야 하는 테이블들
DROP TABLE IF EXISTS public.layouts CASCADE;
DROP TABLE IF EXISTS public.zone_aliases CASCADE;

-- 그 다음 나머지 테이블들
DROP TABLE IF EXISTS public.activity_log CASCADE;
DROP TABLE IF EXISTS public.warehouse_bindings CASCADE;
DROP TABLE IF EXISTS public.items CASCADE;
DROP TABLE IF EXISTS public.wms_raw_rows CASCADE;
DROP TABLE IF EXISTS public.sap_raw_rows CASCADE;
DROP TABLE IF EXISTS public.zones CASCADE;
DROP TABLE IF EXISTS public.sheet_sources CASCADE;
DROP TABLE IF EXISTS public.materials CASCADE;
DROP TABLE IF EXISTS public.major_categories CASCADE;
DROP TABLE IF EXISTS public.warehouses CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- ============================================
-- 5. POLICIES 제거 (RLS)
-- ============================================
-- 필요시 수동으로 제거하거나, 테이블 drop시 자동 제거됨

-- ============================================
-- 6. 확인 메시지
-- ============================================
DO $$
BEGIN
    RAISE NOTICE 'Database reset complete - all tables and views removed';
END
$$;
