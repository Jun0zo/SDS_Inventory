-- Create WMS and SAP tables with ALL actual columns from Google Sheets
-- Based on real sheet headers provided

-- ============================================
-- 1. WMS Raw Table (All Columns)
-- ============================================
CREATE TABLE IF NOT EXISTS public.wms_raw_rows (
  id BIGSERIAL PRIMARY KEY,
  warehouse_code TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES public.sheet_sources(id) ON DELETE CASCADE,
  
  -- WMS Columns (exact from Google Sheet)
  item_code TEXT,                    -- Item Code
  cell_no TEXT,                       -- Cell No.
  production_lot_no TEXT,             -- Production Lot No.
  tot_qty NUMERIC,                    -- Tot. Qty.
  inb_date DATE,                      -- Inb. Date
  valid_date DATE,                    -- Valid Date
  uld_id TEXT,                        -- ULD ID
  source_no TEXT,                     -- Source No.
  lot_attr_5 TEXT,                    -- Lot Attr. 5
  lot_attr_6 TEXT,                    -- Lot Attr. 6
  item_tcd TEXT,                      -- Item Tcd
  item_gcd TEXT,                      -- Item Gcd
  item_gcd_nm TEXT,                   -- Item Gcd Nm
  item_status TEXT,                   -- Item Status
  zone_cd TEXT,                       -- Zone Cd
  exchg_avlb_qty NUMERIC,             -- Exchg. Avlb. Qty
  exchg_tot_qty NUMERIC,              -- Exchg. Tot. Qty.
  available_qty NUMERIC,              -- Available Qty.
  unit TEXT,                          -- Unit
  exchg_unit TEXT,                    -- Exchg. Unit
  prod_date DATE,                     -- Prod. Date
  volume NUMERIC,                     -- Volume
  weight NUMERIC,                     -- Weight
  amount NUMERIC,                     -- Amount
  storer_nm TEXT,                     -- Storer Nm
  alt_code TEXT,                      -- Alt. Code
  comment TEXT,                       -- Comment
  lot_attr_1 TEXT,                    -- Lot Attr. 1
  lot_attr_2 TEXT,                    -- Lot Attr. 2
  lot_attr_3 TEXT,                    -- Lot Attr. 3
  lot_attr_4 TEXT,                    -- Lot Attr. 4
  wh_item_type TEXT,                  -- W/H Item Type
  item_user_col3 TEXT,                -- Item User Col3
  item_user_col4 TEXT,                -- Item User Col4
  item_user_col5 TEXT,                -- Item User Col5
  description TEXT,                   -- Desc
  lot_no TEXT,                        -- Lot No.
  item_nm TEXT,                       -- Item Nm
  supplier_code TEXT,                 -- Supplier Code
  boe_no TEXT,                        -- BOE No.
  
  -- Internal fields for querying (denormalized from above)
  zone TEXT GENERATED ALWAYS AS (zone_cd) STORED,
  location TEXT GENERATED ALWAYS AS (cell_no) STORED,
  item TEXT GENERATED ALWAYS AS (item_code) STORED,
  lot_key TEXT GENERATED ALWAYS AS (COALESCE(production_lot_no, lot_no)) STORED,
  split_key TEXT,  -- From split_by_column if enabled
  
  -- Metadata
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id UUID
);

-- ============================================
-- 2. SAP Raw Table (All Columns)
-- ============================================
CREATE TABLE IF NOT EXISTS public.sap_raw_rows (
  id BIGSERIAL PRIMARY KEY,
  warehouse_code TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES public.sheet_sources(id) ON DELETE CASCADE,
  
  -- SAP Columns (exact from Google Sheet)
  plant TEXT,                                -- Plant
  storage_location TEXT,                     -- Storage location
  material TEXT,                             -- Material
  material_description TEXT,                 -- Material Description
  batch TEXT,                                -- Batch
  stock_segment TEXT,                        -- Stock Segment
  unrestricted NUMERIC,                      -- Unrestricted
  quality_inspection NUMERIC,                -- Quality Inspection
  blocked NUMERIC,                           -- Blocked
  returns NUMERIC,                           -- Returns
  transit_and_transfer NUMERIC,              -- Transit and Transfer
  base_unit_of_measure TEXT,                 -- Base Unit of Measure
  value_unrestricted NUMERIC,                -- Value Unrestricted
  currency TEXT,                             -- Currency
  stock_in_transit NUMERIC,                  -- Stock in Transit
  name_1 TEXT,                               -- Name 1
  material_type TEXT,                        -- Material type
  material_group TEXT,                       -- Material Group
  df_stor_loc_level TEXT,                    -- DF stor. loc. level
  restricted_use_stock NUMERIC,              -- Restricted-Use Stock
  valuated_goods_receipt_blocked_stock NUMERIC, -- Valuated Goods Receipt Blocked Stock
  tied_empties NUMERIC,                      -- Tied Empties
  in_transfer_plant NUMERIC,                 -- In transfer (plant)
  val_in_trans_tfr NUMERIC,                  -- Val. in Trans./Tfr
  value_restricted NUMERIC,                  -- Value Restricted
  val_gr_blocked_st NUMERIC,                 -- Val. GR Blocked St.
  value_in_qualinsp NUMERIC,                 -- Value in QualInsp.
  val_tied_empties NUMERIC,                  -- Val. Tied Empties
  value_blockedstock NUMERIC,                -- Value BlockedStock
  value_rets_blocked NUMERIC,                -- Value Rets Blocked
  value_in_transit NUMERIC,                  -- Value in Transit
  value_in_stock_tfr NUMERIC,                -- Value in Stock Tfr
  
  -- Internal fields for querying (denormalized from above)
  item_code TEXT GENERATED ALWAYS AS (material) STORED,
  lot_key TEXT GENERATED ALWAYS AS (batch) STORED,
  source_location_code TEXT GENERATED ALWAYS AS (storage_location) STORED,
  split_key TEXT,  -- From split_by_column if enabled
  
  -- Aggregated quantities (for backward compatibility)
  unrestricted_qty NUMERIC GENERATED ALWAYS AS (unrestricted) STORED,
  quality_inspection_qty NUMERIC GENERATED ALWAYS AS (quality_inspection) STORED,
  blocked_qty NUMERIC GENERATED ALWAYS AS (blocked) STORED,
  returns_qty NUMERIC GENERATED ALWAYS AS (returns) STORED,
  
  -- Metadata
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id UUID
);

-- ============================================
-- 3. Create Indexes for Fast Queries
-- ============================================

-- WMS Indexes
CREATE INDEX idx_wms_warehouse_source ON public.wms_raw_rows(warehouse_code, source_id);
CREATE INDEX idx_wms_zone_location ON public.wms_raw_rows(warehouse_code, zone_cd, cell_no);
CREATE INDEX idx_wms_item ON public.wms_raw_rows(warehouse_code, item_code);
CREATE INDEX idx_wms_uld ON public.wms_raw_rows(warehouse_code, uld_id) WHERE uld_id IS NOT NULL;
CREATE INDEX idx_wms_split ON public.wms_raw_rows(warehouse_code, split_key) WHERE split_key IS NOT NULL;
CREATE INDEX idx_wms_fetched ON public.wms_raw_rows(fetched_at DESC);

-- Generated column indexes
CREATE INDEX idx_wms_zone ON public.wms_raw_rows(warehouse_code, zone);
CREATE INDEX idx_wms_location ON public.wms_raw_rows(warehouse_code, location);
CREATE INDEX idx_wms_item_gen ON public.wms_raw_rows(warehouse_code, item);

-- SAP Indexes
CREATE INDEX idx_sap_warehouse_source ON public.sap_raw_rows(warehouse_code, source_id);
CREATE INDEX idx_sap_material ON public.sap_raw_rows(warehouse_code, material);
CREATE INDEX idx_sap_plant ON public.sap_raw_rows(warehouse_code, plant);
CREATE INDEX idx_sap_storage_location ON public.sap_raw_rows(warehouse_code, storage_location);
CREATE INDEX idx_sap_split ON public.sap_raw_rows(warehouse_code, split_key) WHERE split_key IS NOT NULL;
CREATE INDEX idx_sap_fetched ON public.sap_raw_rows(fetched_at DESC);

-- Generated column indexes
CREATE INDEX idx_sap_item_gen ON public.sap_raw_rows(warehouse_code, item_code);
CREATE INDEX idx_sap_source_location_gen ON public.sap_raw_rows(warehouse_code, source_location_code);

-- ============================================
-- 4. Enable RLS
-- ============================================

ALTER TABLE public.wms_raw_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_raw_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wms_read_all" ON public.wms_raw_rows FOR SELECT USING (true);
CREATE POLICY "sap_read_all" ON public.sap_raw_rows FOR SELECT USING (true);

-- ============================================
-- 5. Analyze for Query Planner
-- ============================================

ANALYZE public.wms_raw_rows;
ANALYZE public.sap_raw_rows;

-- ============================================
-- 6. Comments
-- ============================================

COMMENT ON TABLE public.wms_raw_rows IS 
  'WMS inventory data - all columns from Google Sheets stored directly';

COMMENT ON TABLE public.sap_raw_rows IS 
  'SAP inventory data - all columns from Google Sheets stored directly';

COMMENT ON COLUMN public.wms_raw_rows.zone IS 
  'Generated column from zone_cd for backward compatibility';

COMMENT ON COLUMN public.wms_raw_rows.location IS 
  'Generated column from cell_no for backward compatibility';

COMMENT ON COLUMN public.sap_raw_rows.item_code IS 
  'Generated column from material for backward compatibility';

COMMENT ON COLUMN public.sap_raw_rows.unrestricted_qty IS 
  'Generated column from unrestricted for backward compatibility';
