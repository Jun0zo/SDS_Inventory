
-- ============================================
-- CURRENT DATABASE SCHEMA - Complete Setup
-- 모든 테이블과 인덱스를 포함한 최신 스키마
-- ============================================

-- ============================================
-- 1. USERS TABLE
-- ============================================
DROP TABLE IF EXISTS public.users CASCADE;
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. WAREHOUSES TABLE
-- ============================================
DROP TABLE IF EXISTS public.warehouses CASCADE;
CREATE TABLE public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  uses_sap BOOLEAN NOT NULL DEFAULT true,
  uses_wms BOOLEAN NOT NULL DEFAULT false,
  time_zone TEXT DEFAULT 'America/New_York',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. ZONES TABLE (layouts 통합됨)
-- ============================================
DROP TABLE IF EXISTS public.zones CASCADE;
CREATE TABLE public.zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE,
  warehouse_code TEXT,
  -- Grid configuration (layouts에서 통합됨)
  grid JSONB,
  grid_version INT DEFAULT 1,
  grid_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(code, warehouse_id)
);

-- ============================================
-- 4. ITEMS TABLE (zone_id 사용, layout_id 제거)
-- ============================================
DROP TABLE IF EXISTS public.items CASCADE;
CREATE TABLE public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES public.zones(id) ON DELETE CASCADE, -- layout_id 대신 zone_id
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('rack', 'flat')),
  zone TEXT NOT NULL,
  location TEXT NOT NULL,
  x INT NOT NULL,
  y INT NOT NULL,
  rotation INT,
  floors INT,
  rows INT NOT NULL,
  cols INT NOT NULL,
  w INT NOT NULL,
  h INT NOT NULL,
  numbering TEXT,
  order_dir TEXT,
  per_floor_locations BOOLEAN,
  max_capacity INT, -- flat 타입용
  floor_capacities JSONB, -- rack 타입용
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. SHEET_SOURCES TABLE
-- ============================================
DROP TABLE IF EXISTS public.sheet_sources CASCADE;
CREATE TABLE public.sheet_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('wms', 'sap')),
  spreadsheet_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  classification JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(spreadsheet_id, sheet_name, type)
);

-- ============================================
-- 6. WMS_RAW_ROWS TABLE (warehouse_code 제거)
-- ============================================
DROP TABLE IF EXISTS public.wms_raw_rows CASCADE;
CREATE TABLE public.wms_raw_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.sheet_sources(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type = 'wms'),
  header TEXT[],
  "row" JSONB,
  zone TEXT,
  location TEXT,
  item_code TEXT,
  split_key TEXT,
  available_qty NUMERIC,
  tot_qty NUMERIC,
  inb_date DATE,
  valid_date DATE,
  prod_date DATE,
  batch_id TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  -- Additional WMS columns from sheets
  exchg_unit TEXT,
  lot_attr_1 TEXT,
  item_user_col5 TEXT,
  item_gcd_nm TEXT,
  wh_item_type TEXT,
  lot_attr_2 TEXT,
  unit TEXT,
  item_nm TEXT,
  volume NUMERIC,
  uld_id TEXT,
  exchg_tot_qty NUMERIC,
  production_lot_no TEXT,
  source_no TEXT,
  item_status TEXT,
  lot_attr_4 TEXT,
  zone_cd TEXT,
  alt_code TEXT,
  supplier_code TEXT,
  description TEXT,
  boe_no TEXT,
  amount NUMERIC,
  lot_attr_3 TEXT,
  item_user_col4 TEXT,
  item_gcd TEXT,
  lot_no TEXT,
  item_code_2 TEXT,
  lot_attr_5 TEXT,
  cell_no TEXT,
  item_user_col3 TEXT,
  exchg_avlb_qty NUMERIC,
  storer_nm TEXT,
  lot_attr_6 TEXT,
  comment TEXT,
  item_tcd TEXT,  -- 추가됨
  weight TEXT     -- 추가됨
);

-- ============================================
-- 7. SAP_RAW_ROWS TABLE (warehouse_code 제거)
-- ============================================
DROP TABLE IF EXISTS public.sap_raw_rows CASCADE;
CREATE TABLE public.sap_raw_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.sheet_sources(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type = 'sap'),
  header TEXT[],
  "row" JSONB,
  -- Core SAP columns
  material TEXT,
  unrestricted_qty NUMERIC,
  quality_inspection_qty NUMERIC,
  blocked_qty NUMERIC,
  returns_qty NUMERIC,
  batch TEXT,
  batch_id TEXT,
  split_key TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  -- Additional SAP columns from SAP_COLUMN_MAP
  plant TEXT,
  storage_location TEXT,
  material_description TEXT,
  stock_segment TEXT,
  transit_and_transfer NUMERIC,
  base_unit_of_measure TEXT,
  value_unrestricted NUMERIC,
  currency TEXT,
  stock_in_transit NUMERIC,
  name_1 TEXT,
  material_type TEXT,
  material_group TEXT,
  df_stor_loc_level TEXT,
  restricted_use_stock NUMERIC,
  valuated_goods_receipt_blocked_stock NUMERIC,
  tied_empties NUMERIC,
  in_transfer_plant NUMERIC,
  val_in_trans_tfr NUMERIC,
  value_restricted NUMERIC,
  val_gr_blocked_st NUMERIC,
  value_in_qualinsp NUMERIC,
  val_tied_empties NUMERIC,
  value_blockedstock NUMERIC,
  value_rets_blocked NUMERIC,
  value_in_transit NUMERIC,
  value_in_stock_tfr NUMERIC
);

-- ============================================
-- 8. MATERIALS TABLE
-- ============================================
DROP TABLE IF EXISTS public.materials CASCADE;
CREATE TABLE public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code TEXT UNIQUE NOT NULL,
  major_category TEXT,
  minor_category TEXT,
  description TEXT,
  unit TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  source_system TEXT CHECK (source_system IN ('wms', 'sap'))
);

-- ============================================
-- 9. MAJOR_CATEGORIES TABLE
-- ============================================
DROP TABLE IF EXISTS public.major_categories CASCADE;
CREATE TABLE public.major_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  color TEXT,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT major_categories_name_not_empty CHECK (name <> '')
);

-- ============================================
-- 10. WAREHOUSE_BINDINGS TABLE
-- ============================================
DROP TABLE IF EXISTS public.warehouse_bindings CASCADE;
CREATE TABLE public.warehouse_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE,
  source_bindings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(warehouse_id)
);

-- ============================================
-- 11. ACTIVITY_LOG TABLE
-- ============================================
DROP TABLE IF EXISTS public.activity_log CASCADE;
CREATE TABLE public.activity_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_warehouses_code ON public.warehouses(code);
CREATE INDEX IF NOT EXISTS idx_zones_code ON public.zones(code);
CREATE INDEX IF NOT EXISTS idx_zones_warehouse_id ON public.zones(warehouse_id);
-- Zone normalization index removed - no longer needed
CREATE INDEX IF NOT EXISTS idx_items_zone_id ON public.items(zone_id);
CREATE INDEX IF NOT EXISTS idx_items_warehouse_id ON public.items(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_sheet_sources_type ON public.sheet_sources(type);
CREATE INDEX IF NOT EXISTS idx_wms_raw_rows_source_id ON public.wms_raw_rows(source_id);
CREATE INDEX IF NOT EXISTS idx_wms_raw_rows_item_code ON public.wms_raw_rows(item_code);
CREATE INDEX IF NOT EXISTS idx_wms_raw_rows_split_key ON public.wms_raw_rows(split_key);
CREATE INDEX IF NOT EXISTS idx_sap_raw_rows_source_id ON public.sap_raw_rows(source_id);
CREATE INDEX IF NOT EXISTS idx_sap_raw_rows_material ON public.sap_raw_rows(material);
CREATE INDEX IF NOT EXISTS idx_materials_item_code ON public.materials(item_code);
CREATE INDEX IF NOT EXISTS idx_warehouse_bindings_warehouse_id ON public.warehouse_bindings(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON public.activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON public.activity_log(created_at DESC);

-- ============================================
-- FUNCTIONS
-- ============================================
-- Zone normalization function removed - no longer needed

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE public.users IS 'User profiles and authentication data';
COMMENT ON TABLE public.warehouses IS 'Warehouse definitions and configurations';
COMMENT ON TABLE public.zones IS 'Warehouse zones with grid configurations (layouts merged)';
COMMENT ON TABLE public.items IS 'Inventory items (racks, flat storage) linked to zones';
COMMENT ON TABLE public.sheet_sources IS 'Google Sheets data sources for WMS/SAP';
COMMENT ON TABLE public.wms_raw_rows IS 'Raw WMS data from sheets (warehouse_code removed)';
COMMENT ON TABLE public.sap_raw_rows IS 'Raw SAP data from sheets (warehouse_code removed)';
COMMENT ON TABLE public.materials IS 'Material catalog with metadata';
COMMENT ON TABLE public.major_categories IS 'Major material categories';
COMMENT ON TABLE public.warehouse_bindings IS 'Warehouse to sheet source mappings';
COMMENT ON TABLE public.activity_log IS 'Audit log of all user actions';
-- Zone normalization function comment removed

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- 모든 사용자에게 모든 권한 허용
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_raw_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_raw_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.major_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Create policies allowing all operations for all users
-- Users table
CREATE POLICY "users_allow_all" ON public.users FOR ALL USING (true) WITH CHECK (true);

-- Warehouses table
CREATE POLICY "warehouses_allow_all" ON public.warehouses FOR ALL USING (true) WITH CHECK (true);

-- Zones table
CREATE POLICY "zones_allow_all" ON public.zones FOR ALL USING (true) WITH CHECK (true);

-- Items table
CREATE POLICY "items_allow_all" ON public.items FOR ALL USING (true) WITH CHECK (true);

-- Sheet sources table
CREATE POLICY "sheet_sources_allow_all" ON public.sheet_sources FOR ALL USING (true) WITH CHECK (true);

-- WMS raw rows table
CREATE POLICY "wms_raw_rows_allow_all" ON public.wms_raw_rows FOR ALL USING (true) WITH CHECK (true);

-- SAP raw rows table
CREATE POLICY "sap_raw_rows_allow_all" ON public.sap_raw_rows FOR ALL USING (true) WITH CHECK (true);

-- Materials table
CREATE POLICY "materials_allow_all" ON public.materials FOR ALL USING (true) WITH CHECK (true);

-- Major categories table
CREATE POLICY "major_categories_allow_all" ON public.major_categories FOR ALL USING (true) WITH CHECK (true);

-- Warehouse bindings table
CREATE POLICY "warehouse_bindings_allow_all" ON public.warehouse_bindings FOR ALL USING (true) WITH CHECK (true);

-- Activity log table
CREATE POLICY "activity_log_allow_all" ON public.activity_log FOR ALL USING (true) WITH CHECK (true);
