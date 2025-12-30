-- Add Expected Item Codes Column
-- Allows setting specific item codes that are allowed in a location
-- Can be used alone or combined with category restrictions

-- Add expected_item_codes column to items table
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS expected_item_codes TEXT[];

-- Add floor-level item code restrictions (same structure as material restrictions)
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS floor_item_codes JSONB;  -- [floor] => string[]

-- Add cell-level item code restrictions
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS cell_item_codes JSONB;  -- [floor][row][col] => string[]

-- Comments
COMMENT ON COLUMN items.expected_item_codes IS
  'Array of allowed item codes for this location. If set, only these specific item codes are allowed.
   Can be combined with category restrictions (OR logic).
   Priority: cell_item_codes > floor_item_codes > expected_item_codes';

COMMENT ON COLUMN items.floor_item_codes IS
  'Floor-level allowed item codes: array of string arrays per floor.
   Example: [["ITEM-001", "ITEM-002"], ["ITEM-003"], null]
   Priority: cell > floor > item';

COMMENT ON COLUMN items.cell_item_codes IS
  'Cell-level allowed item codes: [floor][row][col] => string[]
   Example: [[["ITEM-001"], ["ITEM-002"]], [["ITEM-003"]]]
   Highest priority in item code matching';

-- Create index for array containment queries
CREATE INDEX IF NOT EXISTS idx_items_expected_item_codes
  ON items USING GIN (expected_item_codes);

-- Verify columns were added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'items' AND column_name = 'expected_item_codes'
  ) THEN
    RAISE NOTICE 'expected_item_codes column added successfully';
  ELSE
    RAISE EXCEPTION 'Failed to add expected_item_codes column';
  END IF;
END $$;
