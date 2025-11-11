-- Google Sheet Sources Registry
-- Stores configuration for WMS and SAP sheet sources

-- Drop existing tables if needed for clean migration
DROP TABLE IF EXISTS public.raw_rows CASCADE;
DROP TABLE IF EXISTS public.warehouse_bindings CASCADE;
DROP TABLE IF EXISTS public.sheet_sources CASCADE;

-- 1. Sheet Sources Table
CREATE TABLE IF NOT EXISTS public.sheet_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('wms', 'sap')),
  spreadsheet_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL DEFAULT 'Sheet1',
  
  -- Classification and split configuration as JSONB
  classification JSONB NOT NULL DEFAULT '{}'::JSONB,
  /* Example classification structure:
  WMS: {
    "zone_col": "Zone Cd",
    "location_col": "Cell No.", 
    "item_col": "Item Code",
    "lot_col": "Lot No.",
    "split_enabled": false,
    "split_by_column": null
  }
  
  SAP: {
    "item_col": "Item Code",
    "lot_col": "Lot No.",
    "split_enabled": true,
    "split_by_column": "Plant",
    "source_location_col": "Sloc",
    "unrestricted_col": "Unrestricted",
    "quality_inspection_col": "QI Stock",
    "blocked_col": "Blocked",
    "returns_col": "Returns"
  }
  */
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.sheet_sources ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "sheet_sources_read_all" 
  ON public.sheet_sources FOR SELECT 
  USING (true);

CREATE POLICY "sheet_sources_crud_own" 
  ON public.sheet_sources FOR ALL 
  USING (auth.uid() = created_by);

-- Indexes
CREATE INDEX idx_sheet_sources_type ON public.sheet_sources(type);
CREATE INDEX idx_sheet_sources_created_by ON public.sheet_sources(created_by);

-- Update trigger
CREATE TRIGGER touch_sheet_sources_updated_at 
  BEFORE UPDATE ON public.sheet_sources
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
