-- Warehouse management tables for multi-warehouse support
-- Run this file after the base tables (01_tables.sql, 02_rls.sql, 03_functions.sql)

-- Create warehouses table
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

-- Add warehouse_id to existing tables for proper filtering
-- Note: In production, you'd want to migrate existing data properly

-- Add warehouse_id to zones table
ALTER TABLE public.zones 
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE;

-- Add warehouse_id to items table for direct filtering
ALTER TABLE public.items 
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_warehouses_code ON public.warehouses(code);
CREATE INDEX IF NOT EXISTS idx_warehouses_created_by ON public.warehouses(created_by);
CREATE INDEX IF NOT EXISTS idx_zones_warehouse_id ON public.zones(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_items_warehouse_id ON public.items(warehouse_id);

-- Enable Row Level Security
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for warehouses
-- Read: Everyone can read all warehouses (for demo purposes)
CREATE POLICY "r_wh_read" ON public.warehouses
  FOR SELECT
  USING (true);

-- Insert: Only authenticated users can create warehouses
CREATE POLICY "w_wh_insert" ON public.warehouses
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Update: Only the creator can update their warehouses
CREATE POLICY "w_wh_update" ON public.warehouses
  FOR UPDATE
  USING (auth.uid() = created_by);

-- Delete: Only the creator can delete their warehouses
CREATE POLICY "w_wh_delete" ON public.warehouses
  FOR DELETE
  USING (auth.uid() = created_by);

-- Add comments for documentation
COMMENT ON TABLE public.warehouses IS 'Warehouse definitions with SAP/WMS integration flags';
COMMENT ON COLUMN public.warehouses.code IS 'Unique warehouse identifier code (e.g., WH-US-01)';
COMMENT ON COLUMN public.warehouses.name IS 'Human-readable warehouse name';
COMMENT ON COLUMN public.warehouses.uses_sap IS 'Whether this warehouse uses SAP ERP integration';
COMMENT ON COLUMN public.warehouses.uses_wms IS 'Whether this warehouse uses WMS for location mapping';
COMMENT ON COLUMN public.warehouses.time_zone IS 'Warehouse local timezone for scheduling';

-- Function to get warehouse statistics
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

-- Function to get all warehouses with their stats
CREATE OR REPLACE FUNCTION public.get_warehouses_with_stats()
RETURNS TABLE (
  warehouse JSON
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    json_build_object(
      'id', w.id,
      'code', w.code,
      'name', w.name,
      'uses_sap', w.uses_sap,
      'uses_wms', w.uses_wms,
      'time_zone', w.time_zone,
      'created_at', w.created_at,
      'stats', public.get_warehouse_stats(w.id)
    ) AS warehouse
  FROM public.warehouses w
  ORDER BY w.created_at ASC;
END;
$$;

-- Insert default warehouses if none exist (for demo purposes)
INSERT INTO public.warehouses (code, name, uses_sap, uses_wms, time_zone)
SELECT 'WH-KR-01', 'Seoul Main Warehouse', true, true, 'Asia/Seoul'
WHERE NOT EXISTS (SELECT 1 FROM public.warehouses WHERE code = 'WH-KR-01');

INSERT INTO public.warehouses (code, name, uses_sap, uses_wms, time_zone)
SELECT 'WH-US-01', 'New York Distribution Center', true, false, 'America/New_York'
WHERE NOT EXISTS (SELECT 1 FROM public.warehouses WHERE code = 'WH-US-01');

INSERT INTO public.warehouses (code, name, uses_sap, uses_wms, time_zone)
SELECT 'WH-EU-01', 'Frankfurt Logistics Hub', false, true, 'Europe/Berlin'
WHERE NOT EXISTS (SELECT 1 FROM public.warehouses WHERE code = 'WH-EU-01');

COMMENT ON FUNCTION public.get_warehouse_stats(UUID) IS 'Returns statistics for a specific warehouse';
COMMENT ON FUNCTION public.get_warehouses_with_stats() IS 'Returns all warehouses with their statistics';
