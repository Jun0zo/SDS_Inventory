-- Add warehouse_code to layouts table
-- This allows each warehouse to have its own zone layouts

-- Step 1: Add warehouse_id column to layouts table (UUID is better than code)
ALTER TABLE public.layouts 
ADD COLUMN IF NOT EXISTS warehouse_id UUID;

-- For backward compatibility, also add warehouse_code (but use ID internally)
ALTER TABLE public.layouts 
ADD COLUMN IF NOT EXISTS warehouse_code TEXT;

-- Step 2: Do the same for zones table (if zones are per-warehouse)
-- Note: zones table already has warehouse_id from 10_warehouses.sql, but let's ensure warehouse_code exists too
ALTER TABLE public.zones
ADD COLUMN IF NOT EXISTS warehouse_code TEXT;

-- Step 3: Create a simpler zone_name column in layouts
-- (User-defined zone names, not foreign key to zones table)
ALTER TABLE public.layouts
ADD COLUMN IF NOT EXISTS zone_name TEXT;

-- Step 4: Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_layouts_warehouse_id ON public.layouts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_layouts_warehouse_code ON public.layouts(warehouse_code);
CREATE INDEX IF NOT EXISTS idx_layouts_warehouse_zone ON public.layouts(warehouse_id, zone_name);
CREATE INDEX IF NOT EXISTS idx_zones_warehouse_code ON public.zones(warehouse_code);

-- Step 5: Add foreign key constraint (using UUID for stability)
-- This assumes warehouses table exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'warehouses'
  ) THEN
    -- Add foreign key using warehouse_id (UUID) - stable and never changes!
    ALTER TABLE public.layouts
    DROP CONSTRAINT IF EXISTS fk_layouts_warehouse;
    
    ALTER TABLE public.layouts
    ADD CONSTRAINT fk_layouts_warehouse
    FOREIGN KEY (warehouse_id) 
    REFERENCES public.warehouses(id)
    ON DELETE CASCADE;
    
    -- Optional: Also add FK for warehouse_code with ON UPDATE CASCADE
    -- (in case someone updates the code field)
    ALTER TABLE public.layouts
    DROP CONSTRAINT IF EXISTS fk_layouts_warehouse_code;
    
    ALTER TABLE public.layouts
    ADD CONSTRAINT fk_layouts_warehouse_code
    FOREIGN KEY (warehouse_code)
    REFERENCES public.warehouses(code)
    ON DELETE CASCADE
    ON UPDATE CASCADE;  -- ← Auto-update if code changes!
    
    -- Add FK for zones table too (zones already has warehouse_id from 10_warehouses.sql)
    -- Just add the warehouse_code FK
    ALTER TABLE public.zones
    DROP CONSTRAINT IF EXISTS fk_zones_warehouse_code;
    
    ALTER TABLE public.zones
    ADD CONSTRAINT fk_zones_warehouse_code
    FOREIGN KEY (warehouse_code)
    REFERENCES public.warehouses(code)
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;

-- Step 6: Fix created_by constraint (make it nullable or use auth.uid())
-- Option 1: Drop the FK constraint to public.users and make it nullable
ALTER TABLE public.layouts 
DROP CONSTRAINT IF EXISTS layouts_created_by_fkey;

-- Make created_by nullable (optional, for demo/testing)
ALTER TABLE public.layouts 
ALTER COLUMN created_by DROP NOT NULL;

-- Update RLS policies for layouts
-- Allow users to see all layouts (or restrict by user_id if needed)
ALTER TABLE public.layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "layouts_read_all" ON public.layouts;
CREATE POLICY "layouts_read_all" ON public.layouts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "layouts_write_all" ON public.layouts;
CREATE POLICY "layouts_write_all" ON public.layouts
  FOR ALL USING (true);

-- Step 7: Update RLS policies for items
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "items_read_all" ON public.items;
CREATE POLICY "items_read_all" ON public.items
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "items_write_all" ON public.items;
CREATE POLICY "items_write_all" ON public.items
  FOR ALL USING (true);

-- Step 8: Update comments
COMMENT ON COLUMN public.layouts.warehouse_id IS 'Warehouse ID (UUID) - primary reference, never changes';
COMMENT ON COLUMN public.layouts.warehouse_code IS 'Warehouse code - for display/convenience, synced automatically via trigger';
COMMENT ON COLUMN public.layouts.zone_name IS 'User-defined zone name (e.g., "EA2-A", "PAG-B")';
COMMENT ON COLUMN public.zones.warehouse_code IS 'Warehouse code - auto-synced from warehouse_id via trigger';

-- Step 9: Create helper functions to get layouts by warehouse
-- Using warehouse_code for convenience (auto-joined to get ID)
CREATE OR REPLACE FUNCTION get_warehouse_layouts(p_warehouse_code TEXT)
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

-- Create a trigger to auto-populate warehouse_code from warehouse_id
CREATE OR REPLACE FUNCTION sync_warehouse_code()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-populate warehouse_code from warehouse_id
  IF NEW.warehouse_id IS NOT NULL THEN
    SELECT code INTO NEW.warehouse_code
    FROM public.warehouses
    WHERE id = NEW.warehouse_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to layouts table
DROP TRIGGER IF EXISTS trigger_sync_warehouse_code ON public.layouts;
CREATE TRIGGER trigger_sync_warehouse_code
  BEFORE INSERT OR UPDATE ON public.layouts
  FOR EACH ROW
  EXECUTE FUNCTION sync_warehouse_code();

-- Apply the same trigger to zones table
DROP TRIGGER IF EXISTS trigger_sync_warehouse_code ON public.zones;
CREATE TRIGGER trigger_sync_warehouse_code
  BEFORE INSERT OR UPDATE ON public.zones
  FOR EACH ROW
  EXECUTE FUNCTION sync_warehouse_code();

COMMENT ON FUNCTION get_warehouse_layouts IS 'Get all layouts for a specific warehouse with item counts';
COMMENT ON FUNCTION sync_warehouse_code IS 'Auto-populate warehouse_code from warehouse_id for convenience (used by layouts and zones)';
