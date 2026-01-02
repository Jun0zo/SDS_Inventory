-- Add Zone Type Column to items table
-- Zone types: 'standard' (default), 'block' (blocked area), 'flex' (flexible/buffer area)
-- Block and Flex zones have max_capacity = 0 but still count current stock

-- Add the zone_type column
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS zone_type TEXT DEFAULT 'standard';

-- Add check constraint for valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'items_zone_type_check'
  ) THEN
    ALTER TABLE items
      ADD CONSTRAINT items_zone_type_check
      CHECK (zone_type IN ('standard', 'block', 'flex'));
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN items.zone_type IS
  'Type of zone: standard (normal storage with capacity), block (blocked/restricted area, no capacity), flex (flexible/buffer area, no capacity)';

-- Create index for filtering by zone type
CREATE INDEX IF NOT EXISTS idx_items_zone_type
  ON items(zone_type);

-- Verification
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'items' AND column_name = 'zone_type'
  ) THEN
    RAISE NOTICE 'zone_type column added successfully to items table';
  ELSE
    RAISE EXCEPTION 'Failed to add zone_type column to items table';
  END IF;
END $$;

-- Log completion
SELECT 'Migration 14_add_zone_type.sql completed successfully' AS status;
