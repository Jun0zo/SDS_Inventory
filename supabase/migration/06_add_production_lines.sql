-- ============================================
-- 6. PRODUCTION LINES TABLES
-- ============================================

-- Production Lines Table
DROP TABLE IF EXISTS public.production_lines CASCADE;
CREATE TABLE public.production_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  line_code TEXT NOT NULL,
  line_name TEXT NOT NULL,
  line_count INTEGER DEFAULT 1 CHECK (line_count > 0),
  daily_production_capacity INTEGER DEFAULT 1000 CHECK (daily_production_capacity > 0),
  output_product_code TEXT,
  output_product_name TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(warehouse_id, line_code)
);

-- Production Line Materials Table (BOM)
DROP TABLE IF EXISTS public.production_line_materials CASCADE;
CREATE TABLE public.production_line_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_line_id UUID NOT NULL REFERENCES public.production_lines(id) ON DELETE CASCADE,
  material_code TEXT NOT NULL,
  material_name TEXT NOT NULL,
  quantity_per_unit DECIMAL(10,4) NOT NULL CHECK (quantity_per_unit > 0),
  unit TEXT NOT NULL DEFAULT 'EA',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_production_lines_warehouse_id ON public.production_lines(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_production_lines_line_code ON public.production_lines(line_code);
CREATE INDEX IF NOT EXISTS idx_production_line_materials_production_line_id ON public.production_line_materials(production_line_id);
CREATE INDEX IF NOT EXISTS idx_production_line_materials_material_code ON public.production_line_materials(material_code);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_production_lines_updated_at ON public.production_lines;
CREATE TRIGGER update_production_lines_updated_at
  BEFORE UPDATE ON public.production_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE public.production_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_line_materials ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "production_lines_allow_all" ON public.production_lines;
CREATE POLICY "production_lines_allow_all" ON public.production_lines FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "production_line_materials_allow_all" ON public.production_line_materials;
CREATE POLICY "production_line_materials_allow_all" ON public.production_line_materials FOR ALL USING (true) WITH CHECK (true);

-- Comments
COMMENT ON TABLE public.production_lines IS 'Production lines configuration for warehouses';
COMMENT ON TABLE public.production_line_materials IS 'Bill of Materials (BOM) for each production line';
COMMENT ON COLUMN public.production_lines.line_count IS 'Number of identical production lines';
COMMENT ON COLUMN public.production_line_materials.quantity_per_unit IS 'Materials needed to produce one unit of output';
