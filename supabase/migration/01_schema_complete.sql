-- ============================================
-- Complete Database Schema for SDS Inventory System
-- Run this file first in your Supabase SQL Editor
-- ============================================

-- ============================================
-- SECTION 1: Core Tables
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Warehouses table
CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  uses_sap BOOLEAN NOT NULL DEFAULT true,
  uses_wms BOOLEAN NOT NULL DEFAULT false,
  time_zone TEXT DEFAULT 'America/New_York',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Zones table (warehouse zones like F03, F04, EA2-A, etc.)
CREATE TABLE IF NOT EXISTS public.zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE,
  warehouse_code TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(code, warehouse_id)
);

-- Zone aliases removed - using direct zone matching instead
-- CREATE TABLE IF NOT EXISTS public.zone_aliases ( ... );

-- Layouts table (grid configuration per zone)
CREATE TABLE IF NOT EXISTS public.layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES public.zones(id) ON DELETE CASCADE,
  warehouse_id UUID,
  warehouse_code TEXT,
  zone_name TEXT,
  version INT NOT NULL DEFAULT 1,
  grid JSONB NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Items table (racks and flat storage)
CREATE TABLE IF NOT EXISTS public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id UUID REFERENCES public.layouts(id) ON DELETE CASCADE,
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Major categories table for material classification
CREATE TABLE IF NOT EXISTS public.major_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  color TEXT,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT major_categories_name_not_empty CHECK (name <> '')
);

-- Materials table for managing item/material metadata
CREATE TABLE IF NOT EXISTS public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code TEXT UNIQUE NOT NULL,
  major_category TEXT,
  minor_category TEXT,
  description TEXT,
  unit TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  source_system TEXT,
  CONSTRAINT materials_item_code_not_empty CHECK (item_code <> '')
);

-- Activity log table
CREATE TABLE IF NOT EXISTS public.activity_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SECTION 2: Google Sheets Integration
-- ============================================

-- Sheet sources configuration (WMS and SAP)
CREATE TABLE IF NOT EXISTS public.sheet_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('wms', 'sap')),
  spreadsheet_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL DEFAULT 'Sheet1',
  classification JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Warehouse to sheet source bindings
CREATE TABLE IF NOT EXISTS public.warehouse_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_code TEXT NOT NULL UNIQUE,
  source_bindings JSONB NOT NULL DEFAULT '{}'::JSONB,
  wms_source_ids UUID[] DEFAULT '{}',
  sap_source_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- WMS Raw Data Table
CREATE TABLE IF NOT EXISTS public.wms_raw_rows (
  id BIGSERIAL PRIMARY KEY,
  warehouse_code TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES public.sheet_sources(id) ON DELETE CASCADE,

  -- WMS Columns
  item_code TEXT,
  cell_no TEXT,
  production_lot_no TEXT,
  tot_qty NUMERIC,
  inb_date DATE,
  valid_date DATE,
  uld_id TEXT,
  source_no TEXT,
  lot_attr_5 TEXT,
  lot_attr_6 TEXT,
  item_tcd TEXT,
  item_gcd TEXT,
  item_gcd_nm TEXT,
  item_status TEXT,
  zone_cd TEXT,
  exchg_avlb_qty NUMERIC,
  exchg_tot_qty NUMERIC,
  available_qty NUMERIC,
  unit TEXT,
  exchg_unit TEXT,
  prod_date DATE,
  volume NUMERIC,
  weight NUMERIC,
  amount NUMERIC,
  storer_nm TEXT,
  alt_code TEXT,
  comment TEXT,
  lot_attr_1 TEXT,
  lot_attr_2 TEXT,
  lot_attr_3 TEXT,
  lot_attr_4 TEXT,
  wh_item_type TEXT,
  item_user_col3 TEXT,
  item_user_col4 TEXT,
  item_user_col5 TEXT,
  description TEXT,
  lot_no TEXT,
  item_nm TEXT,
  supplier_code TEXT,
  boe_no TEXT,

  -- Generated columns
  zone TEXT GENERATED ALWAYS AS (zone_cd) STORED,
  location TEXT GENERATED ALWAYS AS (cell_no) STORED,
  item TEXT GENERATED ALWAYS AS (item_code) STORED,
  lot_key TEXT GENERATED ALWAYS AS (COALESCE(production_lot_no, lot_no)) STORED,
  split_key TEXT,

  -- Metadata
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id UUID
);

-- SAP Raw Data Table
CREATE TABLE IF NOT EXISTS public.sap_raw_rows (
  id BIGSERIAL PRIMARY KEY,
  warehouse_code TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES public.sheet_sources(id) ON DELETE CASCADE,

  -- SAP Columns
  plant TEXT,
  storage_location TEXT,
  material TEXT,
  material_description TEXT,
  batch TEXT,
  stock_segment TEXT,
  unrestricted NUMERIC,
  quality_inspection NUMERIC,
  blocked NUMERIC,
  returns NUMERIC,
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
  value_in_stock_tfr NUMERIC,

  -- Generated columns
  item_code TEXT GENERATED ALWAYS AS (material) STORED,
  lot_key TEXT GENERATED ALWAYS AS (batch) STORED,
  source_location_code TEXT GENERATED ALWAYS AS (storage_location) STORED,
  split_key TEXT,
  unrestricted_qty NUMERIC GENERATED ALWAYS AS (unrestricted) STORED,
  quality_inspection_qty NUMERIC GENERATED ALWAYS AS (quality_inspection) STORED,
  blocked_qty NUMERIC GENERATED ALWAYS AS (blocked) STORED,
  returns_qty NUMERIC GENERATED ALWAYS AS (returns) STORED,

  -- Metadata
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id UUID
);

-- ============================================
-- SECTION 3: Functions (must be defined before indexes that use them)
-- ============================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Zone normalization function (used by indexes below)
CREATE OR REPLACE FUNCTION public.normalize_zone_code(zone_code TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN UPPER(TRIM(REPLACE(COALESCE(zone_code, ''), '-', '')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Sync warehouse_code from warehouse_id
CREATE OR REPLACE FUNCTION public.sync_warehouse_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.warehouse_id IS NOT NULL THEN
    SELECT code INTO NEW.warehouse_code
    FROM public.warehouses
    WHERE id = NEW.warehouse_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Zone aliases functions removed - using direct zone matching
-- CREATE OR REPLACE FUNCTION public.create_zone_aliases()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.zone_aliases (zone_id, alias, source_type)
  VALUES (NEW.id, NEW.code, 'zone')
  ON CONFLICT (alias, zone_id) DO NOTHING;

  IF public.normalize_zone_code(NEW.code) != NEW.code THEN
    INSERT INTO public.zone_aliases (zone_id, alias, source_type)
    VALUES (NEW.id, public.normalize_zone_code(NEW.code), 'zone')
    ON CONFLICT (alias, zone_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Find zone by alias
CREATE OR REPLACE FUNCTION public.find_zone_by_alias(
  p_alias TEXT,
  p_warehouse_code TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_zone_id UUID;
BEGIN
  SELECT za.zone_id INTO v_zone_id
  FROM public.zone_aliases za
  JOIN public.zones z ON z.id = za.zone_id
  WHERE public.normalize_zone_code(za.alias) = public.normalize_zone_code(p_alias)
    AND (p_warehouse_code IS NULL OR z.warehouse_code = p_warehouse_code)
  LIMIT 1;

  RETURN v_zone_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get warehouse statistics
CREATE OR REPLACE FUNCTION public.get_warehouse_stats(warehouse_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'zones_count', COUNT(DISTINCT z.id),
    'items_count', COUNT(DISTINCT i.id),
    'rack_count', SUM(CASE WHEN i.type = 'rack' THEN 1 ELSE 0 END),
    'flat_count', SUM(CASE WHEN i.type = 'flat' THEN 1 ELSE 0 END),
    'total_capacity', SUM(
      CASE
        WHEN i.type = 'rack' THEN i.floors * i.rows * i.cols
        WHEN i.type = 'flat' THEN i.rows * i.cols
        ELSE 0
      END
    )
  )
  INTO result
  FROM public.warehouses w
  LEFT JOIN public.zones z ON z.warehouse_id = w.id
  LEFT JOIN public.layouts l ON l.zone_id = z.id
  LEFT JOIN public.items i ON i.layout_id = l.id
  WHERE w.id = warehouse_uuid
  GROUP BY w.id;

  RETURN result;
END;
$$;

-- Get warehouse sources
CREATE OR REPLACE FUNCTION public.get_warehouse_sources(p_warehouse_code TEXT)
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
  FROM public.warehouse_bindings,
       jsonb_each(source_bindings)
  WHERE warehouse_code = p_warehouse_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if split value is already in use
CREATE OR REPLACE FUNCTION public.is_split_value_in_use(
  p_source_id UUID,
  p_split_value TEXT,
  p_exclude_warehouse_code TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM public.warehouse_bindings,
       jsonb_each(source_bindings)
  WHERE key::UUID = p_source_id
    AND value->>'split_value' = p_split_value
    AND (p_exclude_warehouse_code IS NULL OR warehouse_code != p_exclude_warehouse_code);

  RETURN v_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get warehouse layouts
CREATE OR REPLACE FUNCTION public.get_warehouse_layouts(p_warehouse_code TEXT)
RETURNS TABLE (
  id UUID,
  warehouse_id UUID,
  warehouse_code TEXT,
  zone_name TEXT,
  version INT,
  grid JSONB,
  item_count BIGINT,
  created_by UUID,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.warehouse_id,
    l.warehouse_code,
    l.zone_name,
    l.version,
    l.grid,
    COUNT(i.id) AS item_count,
    l.created_by,
    l.updated_at
  FROM public.layouts l
  LEFT JOIN public.items i ON i.layout_id = l.id
  WHERE l.warehouse_code = p_warehouse_code
  GROUP BY l.id, l.warehouse_id, l.warehouse_code, l.zone_name, l.version, l.grid, l.created_by, l.updated_at
  ORDER BY l.zone_name, l.updated_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SECTION 4: Indexes
-- ============================================

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Warehouses indexes
CREATE INDEX IF NOT EXISTS idx_warehouses_code ON public.warehouses(code);
CREATE INDEX IF NOT EXISTS idx_warehouses_created_by ON public.warehouses(created_by);

-- Zones indexes
CREATE INDEX IF NOT EXISTS idx_zones_warehouse_id ON public.zones(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_zones_warehouse_code ON public.zones(warehouse_code);
CREATE INDEX IF NOT EXISTS idx_zones_code_normalized ON public.zones(normalize_zone_code(code));

-- Zone aliases indexes
CREATE INDEX IF NOT EXISTS idx_zone_aliases_zone_id ON public.zone_aliases(zone_id);
CREATE INDEX IF NOT EXISTS idx_zone_aliases_normalized ON public.zone_aliases(normalize_zone_code(alias));

-- Layouts indexes
CREATE INDEX IF NOT EXISTS idx_layouts_zone_id ON public.layouts(zone_id);
CREATE INDEX IF NOT EXISTS idx_layouts_warehouse_id ON public.layouts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_layouts_warehouse_code ON public.layouts(warehouse_code);
CREATE INDEX IF NOT EXISTS idx_layouts_warehouse_zone ON public.layouts(warehouse_id, zone_name);
CREATE INDEX IF NOT EXISTS idx_layouts_created_by ON public.layouts(created_by);

-- Items indexes
CREATE INDEX IF NOT EXISTS idx_items_layout_id ON public.items(layout_id);
CREATE INDEX IF NOT EXISTS idx_items_zone ON public.items(zone);
CREATE INDEX IF NOT EXISTS idx_items_warehouse_id ON public.items(warehouse_id);

-- Materials indexes
CREATE INDEX IF NOT EXISTS idx_materials_item_code ON public.materials(item_code);
CREATE INDEX IF NOT EXISTS idx_materials_major_category ON public.materials(major_category);
CREATE INDEX IF NOT EXISTS idx_materials_minor_category ON public.materials(minor_category);
CREATE INDEX IF NOT EXISTS idx_materials_last_seen ON public.materials(last_seen_at DESC);

-- Major categories indexes
CREATE INDEX IF NOT EXISTS idx_major_categories_name ON public.major_categories(name);
CREATE INDEX IF NOT EXISTS idx_major_categories_display_order ON public.major_categories(display_order);

-- Activity log indexes
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON public.activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON public.activity_log(created_at DESC);

-- Sheet sources indexes
CREATE INDEX IF NOT EXISTS idx_sheet_sources_type ON public.sheet_sources(type);
CREATE INDEX IF NOT EXISTS idx_sheet_sources_created_by ON public.sheet_sources(created_by);

-- Warehouse bindings indexes
CREATE INDEX IF NOT EXISTS idx_warehouse_bindings_code ON public.warehouse_bindings(warehouse_code);
CREATE INDEX IF NOT EXISTS idx_warehouse_bindings_created_by ON public.warehouse_bindings(created_by);

-- WMS raw rows indexes
CREATE INDEX IF NOT EXISTS idx_wms_warehouse_source ON public.wms_raw_rows(warehouse_code, source_id);
CREATE INDEX IF NOT EXISTS idx_wms_zone_location ON public.wms_raw_rows(warehouse_code, zone_cd, cell_no);
CREATE INDEX IF NOT EXISTS idx_wms_item ON public.wms_raw_rows(warehouse_code, item_code);
CREATE INDEX IF NOT EXISTS idx_wms_uld ON public.wms_raw_rows(warehouse_code, uld_id) WHERE uld_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wms_split ON public.wms_raw_rows(warehouse_code, split_key) WHERE split_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wms_fetched ON public.wms_raw_rows(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_wms_zone ON public.wms_raw_rows(warehouse_code, zone);
CREATE INDEX IF NOT EXISTS idx_wms_location ON public.wms_raw_rows(warehouse_code, location);
CREATE INDEX IF NOT EXISTS idx_wms_item_gen ON public.wms_raw_rows(warehouse_code, item);

-- SAP raw rows indexes
CREATE INDEX IF NOT EXISTS idx_sap_warehouse_source ON public.sap_raw_rows(warehouse_code, source_id);
CREATE INDEX IF NOT EXISTS idx_sap_material ON public.sap_raw_rows(warehouse_code, material);
CREATE INDEX IF NOT EXISTS idx_sap_plant ON public.sap_raw_rows(warehouse_code, plant);
CREATE INDEX IF NOT EXISTS idx_sap_storage_location ON public.sap_raw_rows(warehouse_code, storage_location);
CREATE INDEX IF NOT EXISTS idx_sap_split ON public.sap_raw_rows(warehouse_code, split_key) WHERE split_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sap_fetched ON public.sap_raw_rows(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_sap_item_gen ON public.sap_raw_rows(warehouse_code, material);
CREATE INDEX IF NOT EXISTS idx_sap_source_location_gen ON public.sap_raw_rows(warehouse_code, source_location_code);

-- ============================================
-- SECTION 5: Triggers
-- ============================================

-- Update triggers
DROP TRIGGER IF EXISTS trg_touch_layout ON public.layouts;
CREATE TRIGGER trg_touch_layout
  BEFORE UPDATE ON public.layouts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_sheet_sources_updated_at ON public.sheet_sources;
CREATE TRIGGER touch_sheet_sources_updated_at
  BEFORE UPDATE ON public.sheet_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_warehouse_bindings_updated_at ON public.warehouse_bindings;
CREATE TRIGGER touch_warehouse_bindings_updated_at
  BEFORE UPDATE ON public.warehouse_bindings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Warehouse code sync triggers
DROP TRIGGER IF EXISTS trigger_sync_warehouse_code ON public.layouts;
CREATE TRIGGER trigger_sync_warehouse_code
  BEFORE INSERT OR UPDATE ON public.layouts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_warehouse_code();

DROP TRIGGER IF EXISTS trigger_sync_warehouse_code_zones ON public.zones;
CREATE TRIGGER trigger_sync_warehouse_code_zones
  BEFORE INSERT OR UPDATE ON public.zones
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_warehouse_code();

-- Zone aliases trigger
DROP TRIGGER IF EXISTS trigger_create_zone_aliases ON public.zones;
CREATE TRIGGER trigger_create_zone_aliases
  AFTER INSERT ON public.zones
  FOR EACH ROW
  EXECUTE FUNCTION public.create_zone_aliases();

-- ============================================
-- SECTION 6: Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zone_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.major_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_raw_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_raw_rows ENABLE ROW LEVEL SECURITY;

-- Users policies
DROP POLICY IF EXISTS "Anyone can read users" ON public.users;
CREATE POLICY "Anyone can read users" ON public.users
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can modify users" ON public.users;
CREATE POLICY "Anyone can modify users" ON public.users
  FOR ALL USING (true);

-- Warehouses policies
DROP POLICY IF EXISTS "r_wh_read" ON public.warehouses;
CREATE POLICY "r_wh_read" ON public.warehouses
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "w_wh_insert" ON public.warehouses;
CREATE POLICY "w_wh_insert" ON public.warehouses
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "w_wh_update" ON public.warehouses;
CREATE POLICY "w_wh_update" ON public.warehouses
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "w_wh_delete" ON public.warehouses;
CREATE POLICY "w_wh_delete" ON public.warehouses
  FOR DELETE USING (true);

-- Zones policies
DROP POLICY IF EXISTS "Anyone can read zones" ON public.zones;
CREATE POLICY "Anyone can read zones" ON public.zones
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can create zones" ON public.zones;
CREATE POLICY "Anyone can create zones" ON public.zones
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update zones" ON public.zones;
CREATE POLICY "Anyone can update zones" ON public.zones
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Anyone can delete zones" ON public.zones;
CREATE POLICY "Anyone can delete zones" ON public.zones
  FOR DELETE USING (true);

-- Zone aliases policies
DROP POLICY IF EXISTS "zone_aliases_read_all" ON public.zone_aliases;
CREATE POLICY "zone_aliases_read_all" ON public.zone_aliases
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "zone_aliases_write_all" ON public.zone_aliases;
CREATE POLICY "zone_aliases_write_all" ON public.zone_aliases
  FOR ALL USING (true);

-- Layouts policies
DROP POLICY IF EXISTS "layouts_read_all" ON public.layouts;
CREATE POLICY "layouts_read_all" ON public.layouts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "layouts_write_all" ON public.layouts;
CREATE POLICY "layouts_write_all" ON public.layouts
  FOR ALL USING (true);

-- Items policies
DROP POLICY IF EXISTS "items_read_all" ON public.items;
CREATE POLICY "items_read_all" ON public.items
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "items_write_all" ON public.items;
CREATE POLICY "items_write_all" ON public.items
  FOR ALL USING (true);

-- Materials policies
DROP POLICY IF EXISTS "materials_read_all" ON public.materials;
CREATE POLICY "materials_read_all" ON public.materials
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "materials_write_all" ON public.materials;
CREATE POLICY "materials_write_all" ON public.materials
  FOR ALL USING (true);

-- Major categories policies
DROP POLICY IF EXISTS "major_categories_read_all" ON public.major_categories;
CREATE POLICY "major_categories_read_all" ON public.major_categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "major_categories_write_all" ON public.major_categories;
CREATE POLICY "major_categories_write_all" ON public.major_categories
  FOR ALL USING (true);

-- Activity log policies
DROP POLICY IF EXISTS "Anyone can read activity logs" ON public.activity_log;
CREATE POLICY "Anyone can read activity logs" ON public.activity_log
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can log activity" ON public.activity_log;
CREATE POLICY "Anyone can log activity" ON public.activity_log
  FOR INSERT WITH CHECK (true);

-- Sheet sources policies
DROP POLICY IF EXISTS "sheet_sources_read_all" ON public.sheet_sources;
CREATE POLICY "sheet_sources_read_all"
  ON public.sheet_sources FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "sheet_sources_crud_all" ON public.sheet_sources;
CREATE POLICY "sheet_sources_crud_all"
  ON public.sheet_sources FOR ALL
  USING (true);

-- Warehouse bindings policies
DROP POLICY IF EXISTS "warehouse_bindings_read_all" ON public.warehouse_bindings;
CREATE POLICY "warehouse_bindings_read_all"
  ON public.warehouse_bindings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "warehouse_bindings_crud_all" ON public.warehouse_bindings;
CREATE POLICY "warehouse_bindings_crud_all"
  ON public.warehouse_bindings FOR ALL
  USING (true);

-- WMS raw rows policies
DROP POLICY IF EXISTS "wms_read_all" ON public.wms_raw_rows;
CREATE POLICY "wms_read_all" ON public.wms_raw_rows FOR SELECT USING (true);

DROP POLICY IF EXISTS "wms_write_all" ON public.wms_raw_rows;
CREATE POLICY "wms_write_all" ON public.wms_raw_rows FOR ALL USING (true);

-- SAP raw rows policies
DROP POLICY IF EXISTS "sap_read_all" ON public.sap_raw_rows;
CREATE POLICY "sap_read_all" ON public.sap_raw_rows FOR SELECT USING (true);

DROP POLICY IF EXISTS "sap_write_all" ON public.sap_raw_rows;
CREATE POLICY "sap_write_all" ON public.sap_raw_rows FOR ALL USING (true);

-- ============================================
-- SECTION 7: Initial Data
-- ============================================

-- Insert default major categories
INSERT INTO public.major_categories (name, display_order, description) VALUES
  ('Raw Material', 1, 'Raw materials and components'),
  ('Semi-Finished Goods', 2, 'Work in progress items'),
  ('Finished Goods', 3, 'Completed products ready for sale'),
  ('Packaging Material', 4, 'Packaging and wrapping materials'),
  ('Spare Parts', 5, 'Replacement parts and components'),
  ('Consumables', 6, 'Consumable items and supplies'),
  ('Other', 999, 'Miscellaneous items')
ON CONFLICT (name) DO NOTHING;

-- Insert default warehouses
INSERT INTO public.warehouses (code, name, uses_sap, uses_wms, time_zone) VALUES
  ('WH-KR-01', 'Seoul Main Warehouse', true, true, 'Asia/Seoul'),
  ('WH-US-01', 'New York Distribution Center', true, false, 'America/New_York'),
  ('WH-EU-01', 'Frankfurt Logistics Hub', false, true, 'Europe/Berlin')
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- SECTION 8: Comments
-- ============================================

COMMENT ON TABLE public.users IS 'User profiles and authentication data';
COMMENT ON TABLE public.warehouses IS 'Warehouse definitions with SAP/WMS integration flags';
COMMENT ON TABLE public.zones IS 'Warehouse zones (floors, areas, etc.)';
COMMENT ON TABLE public.zone_aliases IS 'Maps zone code variations to canonical zones';
COMMENT ON TABLE public.layouts IS 'Grid configurations for each zone';
COMMENT ON TABLE public.items IS 'Inventory items (racks, flat storage, etc.)';
COMMENT ON TABLE public.materials IS 'Materials catalog with user-defined classifications';
COMMENT ON TABLE public.major_categories IS 'User-defined major categories for material classification';
COMMENT ON TABLE public.activity_log IS 'Audit log of all user actions';
COMMENT ON TABLE public.sheet_sources IS 'Google Sheets source configurations';
COMMENT ON TABLE public.warehouse_bindings IS 'Warehouse to sheet source mappings';
COMMENT ON TABLE public.wms_raw_rows IS 'WMS inventory data from Google Sheets';
COMMENT ON TABLE public.sap_raw_rows IS 'SAP inventory data from Google Sheets';

-- Analyze for query planner
ANALYZE public.wms_raw_rows;
ANALYZE public.sap_raw_rows;
ANALYZE public.materials;
ANALYZE public.zones;
ANALYZE public.zone_aliases;

-- ============================================
-- Migration Complete!
-- Now run 02_materialized_views.sql (optional)
-- ============================================
