-- Warehouse to Sheet Source Bindings
-- Maps warehouses to multiple WMS and SAP sources

CREATE TABLE IF NOT EXISTS public.warehouse_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_code TEXT NOT NULL UNIQUE,  -- User-defined warehouse code
  
  -- Source bindings with optional split values
  -- Format: { "source_uuid": { "type": "wms", "split_value": "Plant A" }, ... }
  source_bindings JSONB NOT NULL DEFAULT '{}'::JSONB,
  
  -- Deprecated: Keep for backward compatibility, will be removed
  wms_source_ids UUID[] DEFAULT '{}',
  sap_source_ids UUID[] DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.warehouse_bindings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "warehouse_bindings_read_all" 
  ON public.warehouse_bindings FOR SELECT 
  USING (true);

CREATE POLICY "warehouse_bindings_crud_own" 
  ON public.warehouse_bindings FOR ALL 
  USING (auth.uid() = created_by);

-- Indexes
CREATE INDEX idx_warehouse_bindings_code ON public.warehouse_bindings(warehouse_code);
CREATE INDEX idx_warehouse_bindings_created_by ON public.warehouse_bindings(created_by);

-- Update trigger
CREATE TRIGGER touch_warehouse_bindings_updated_at 
  BEFORE UPDATE ON public.warehouse_bindings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Helper function to get all source bindings for a warehouse
CREATE OR REPLACE FUNCTION get_warehouse_sources(p_warehouse_code TEXT)
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

-- Function to check if a split value is already in use
CREATE OR REPLACE FUNCTION is_split_value_in_use(
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
