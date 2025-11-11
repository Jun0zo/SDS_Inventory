-- Production Lines Table
CREATE TABLE IF NOT EXISTS production_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  line_code VARCHAR(50) NOT NULL,
  line_name VARCHAR(200) NOT NULL,
  line_count INTEGER NOT NULL DEFAULT 1 CHECK (line_count > 0),
  output_product_code VARCHAR(50),
  output_product_name VARCHAR(200),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(warehouse_id, line_code)
);

-- Production Line Materials Table (BOM - Bill of Materials)
CREATE TABLE IF NOT EXISTS production_line_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_line_id UUID NOT NULL REFERENCES production_lines(id) ON DELETE CASCADE,
  material_code VARCHAR(50) NOT NULL,
  material_name VARCHAR(200) NOT NULL,
  quantity_per_unit DECIMAL(10, 4) NOT NULL CHECK (quantity_per_unit > 0),
  unit VARCHAR(20) NOT NULL DEFAULT 'EA',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_production_lines_warehouse_id ON production_lines(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_production_line_materials_line_id ON production_line_materials(production_line_id);
CREATE INDEX IF NOT EXISTS idx_production_lines_line_code ON production_lines(line_code);

-- Enable Row Level Security
ALTER TABLE production_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_line_materials ENABLE ROW LEVEL SECURITY;

-- RLS Policies for production_lines
CREATE POLICY "Users can view production lines in their organization"
  ON production_lines FOR SELECT
  USING (true);

CREATE POLICY "Users can insert production lines"
  ON production_lines FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update production lines"
  ON production_lines FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete production lines"
  ON production_lines FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for production_line_materials
CREATE POLICY "Users can view production line materials"
  ON production_line_materials FOR SELECT
  USING (true);

CREATE POLICY "Users can insert production line materials"
  ON production_line_materials FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update production line materials"
  ON production_line_materials FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete production line materials"
  ON production_line_materials FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_production_line_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_production_line_timestamp
  BEFORE UPDATE ON production_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_production_line_updated_at();

-- Comments for documentation
COMMENT ON TABLE production_lines IS 'Production lines within warehouses';
COMMENT ON TABLE production_line_materials IS 'Bill of Materials (BOM) for production lines - materials consumed per unit produced';
COMMENT ON COLUMN production_lines.line_count IS 'Number of production lines';
COMMENT ON COLUMN production_line_materials.quantity_per_unit IS 'Quantity of material consumed per unit produced';
