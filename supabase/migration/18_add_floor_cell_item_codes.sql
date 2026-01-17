-- Migration: Add floor_item_codes and cell_item_codes to items table
-- Enables hierarchical item code restrictions at floor and cell levels

-- ============================================================
-- 1. Add Columns to items Table
-- ============================================================

-- Add floor-level item codes (array of string arrays, one per floor)
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS floor_item_codes JSONB;

-- Add cell-level item codes (2D array of string arrays [floor][cell])
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS cell_item_codes JSONB;

-- ============================================================
-- 2. Add Indexes for Performance
-- ============================================================

-- Index for floor_item_codes (GIN for JSONB query performance)
CREATE INDEX IF NOT EXISTS idx_items_floor_item_codes
  ON items USING GIN(floor_item_codes)
  WHERE floor_item_codes IS NOT NULL;

-- Index for cell_item_codes (GIN for JSONB query performance)
CREATE INDEX IF NOT EXISTS idx_items_cell_item_codes
  ON items USING GIN(cell_item_codes)
  WHERE cell_item_codes IS NOT NULL;

-- ============================================================
-- 3. Comments
-- ============================================================

COMMENT ON COLUMN items.floor_item_codes IS
  'Array of item code arrays per floor: [["EA123", "EA456"], ["EA789"], ...]. Allows specifying expected item codes for each floor of a rack.';

COMMENT ON COLUMN items.cell_item_codes IS
  '2D array of item code arrays per floor and cell: [[["EA123"], ["EA456"]], [[null], ["EA789"]], ...]. Allows specifying expected item codes for each cell in a rack. Priority: cell > floor > item.';

-- ============================================================
-- 4. Update Trigger to Include New Columns
-- ============================================================

-- Update the component metadata refresh trigger to include new columns
DO $$
BEGIN
  -- Drop existing trigger if it exists
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_items_metadata_refresh'
    AND tgrelid = 'items'::regclass
  ) THEN
    DROP TRIGGER trigger_items_metadata_refresh ON items;
  END IF;

  -- Create new trigger with floor/cell item codes support
  CREATE TRIGGER trigger_items_metadata_refresh
    AFTER UPDATE OF
      expected_major_category,
      expected_minor_category,
      expected_item_codes,
      feeds_production_line_ids,
      floor_material_restrictions,
      cell_material_restrictions,
      floor_item_codes,
      cell_item_codes
    ON items
    FOR EACH STATEMENT
    EXECUTE FUNCTION trigger_refresh_component_metadata();
END $$;

-- ============================================================
-- 5. Validation Function (Optional)
-- ============================================================

-- Function to validate floor/cell item codes structure
CREATE OR REPLACE FUNCTION validate_item_codes_structure()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate floor_item_codes structure
  IF NEW.floor_item_codes IS NOT NULL THEN
    -- Must be an array
    IF jsonb_typeof(NEW.floor_item_codes) != 'array' THEN
      RAISE EXCEPTION 'floor_item_codes must be a JSON array';
    END IF;

    -- Each element must be null or an array of strings
    -- (We'll do basic validation here, more complex validation can be done in application layer)
  END IF;

  -- Validate cell_item_codes structure
  IF NEW.cell_item_codes IS NOT NULL THEN
    -- Must be an array
    IF jsonb_typeof(NEW.cell_item_codes) != 'array' THEN
      RAISE EXCEPTION 'cell_item_codes must be a JSON array';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create validation trigger
DROP TRIGGER IF EXISTS trigger_validate_item_codes ON items;
CREATE TRIGGER trigger_validate_item_codes
  BEFORE INSERT OR UPDATE OF floor_item_codes, cell_item_codes ON items
  FOR EACH ROW
  EXECUTE FUNCTION validate_item_codes_structure();

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON FUNCTION validate_item_codes_structure IS
  'Validates the structure of floor_item_codes and cell_item_codes JSONB columns to ensure they are properly formatted arrays.';
