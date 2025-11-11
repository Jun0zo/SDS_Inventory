-- Materials table for managing item/material metadata
-- This table stores information about each unique item_code/material
-- Updated automatically during sync operations

CREATE TABLE IF NOT EXISTS public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code TEXT UNIQUE NOT NULL, -- The unique identifier for the material (from WMS or SAP)
  
  -- User-defined classification
  major_category TEXT, -- Major category (dropdown selection)
  minor_category TEXT, -- Minor category (free text input)
  
  -- Metadata
  description TEXT, -- Item description (auto-populated from source data)
  unit TEXT, -- Unit of measurement (e.g., EA, KG, M)
  
  -- System fields
  first_seen_at TIMESTAMPTZ DEFAULT NOW(), -- When this item was first discovered
  last_seen_at TIMESTAMPTZ DEFAULT NOW(), -- When this item was last seen in a sync
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Source tracking
  source_system TEXT, -- 'wms' or 'sap' or 'both'
  
  CONSTRAINT materials_item_code_not_empty CHECK (item_code <> '')
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_materials_item_code ON public.materials(item_code);
CREATE INDEX IF NOT EXISTS idx_materials_major_category ON public.materials(major_category);
CREATE INDEX IF NOT EXISTS idx_materials_minor_category ON public.materials(minor_category);
CREATE INDEX IF NOT EXISTS idx_materials_last_seen ON public.materials(last_seen_at DESC);

-- Add comments for documentation
COMMENT ON TABLE public.materials IS 'Materials catalog with user-defined classifications';
COMMENT ON COLUMN public.materials.item_code IS 'Unique identifier for the material (from WMS or SAP)';
COMMENT ON COLUMN public.materials.major_category IS 'User-defined major category (dropdown selection)';
COMMENT ON COLUMN public.materials.minor_category IS 'User-defined minor category (free text)';
COMMENT ON COLUMN public.materials.source_system IS 'Source system(s) where this material appears';
