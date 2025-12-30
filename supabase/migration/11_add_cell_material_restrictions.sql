-- Migration: Add cell/floor-level material restrictions to items table
-- Purpose: Enable setting material category restrictions at floor or cell granularity
-- Date: 2025-12-22

-- ============================================================
-- 1. Add Material Restriction Columns to items Table
-- ============================================================

-- Floor-level material restrictions: array of {major_category, minor_category} per floor
-- Structure: [{"major_category": "Electronics", "minor_category": "CPU"}, null, ...]
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS floor_material_restrictions JSONB;

-- Cell-level material restrictions: [floor][row][col] => {major_category, minor_category}
-- Structure: [[[{"major_category": "Electronics", "minor_category": "CPU"}, ...], ...], ...]
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS cell_material_restrictions JSONB;

-- ============================================================
-- 2. Indexes for Performance
-- ============================================================

-- Index for querying items with floor restrictions
CREATE INDEX IF NOT EXISTS idx_items_floor_material_restrictions
  ON items USING GIN(floor_material_restrictions)
  WHERE floor_material_restrictions IS NOT NULL;

-- Index for querying items with cell restrictions
CREATE INDEX IF NOT EXISTS idx_items_cell_material_restrictions
  ON items USING GIN(cell_material_restrictions)
  WHERE cell_material_restrictions IS NOT NULL;

-- ============================================================
-- 3. Helper Functions
-- ============================================================

-- Get material restriction for a specific floor
-- Returns {major_category, minor_category} or NULL
CREATE OR REPLACE FUNCTION get_floor_material_restriction(
  p_item_id UUID,
  p_floor_idx INTEGER  -- 0-based floor index
)
RETURNS JSONB AS $$
DECLARE
  v_restrictions JSONB;
  v_restriction JSONB;
BEGIN
  SELECT floor_material_restrictions INTO v_restrictions
  FROM items
  WHERE id = p_item_id;

  IF v_restrictions IS NULL THEN
    RETURN NULL;
  END IF;

  v_restriction := v_restrictions->p_floor_idx;

  RETURN v_restriction;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_floor_material_restriction IS
  'Returns material restriction for a specific floor of an item. Returns NULL if no restriction exists.';

-- Get material restriction for a specific cell
-- Applies priority logic: cell > floor > item
CREATE OR REPLACE FUNCTION get_cell_material_restriction(
  p_item_id UUID,
  p_floor_idx INTEGER,  -- 0-based
  p_row_idx INTEGER,    -- 0-based
  p_col_idx INTEGER     -- 0-based
)
RETURNS JSONB AS $$
DECLARE
  v_item RECORD;
  v_cell_restriction JSONB;
  v_floor_restriction JSONB;
  v_result JSONB;
BEGIN
  SELECT
    cell_material_restrictions,
    floor_material_restrictions,
    expected_major_category,
    expected_minor_category
  INTO v_item
  FROM items
  WHERE id = p_item_id;

  -- Priority 1: Cell-level restriction
  IF v_item.cell_material_restrictions IS NOT NULL THEN
    v_cell_restriction := v_item.cell_material_restrictions->p_floor_idx->p_row_idx->p_col_idx;
    IF v_cell_restriction IS NOT NULL THEN
      RETURN v_cell_restriction;
    END IF;
  END IF;

  -- Priority 2: Floor-level restriction
  IF v_item.floor_material_restrictions IS NOT NULL THEN
    v_floor_restriction := v_item.floor_material_restrictions->p_floor_idx;
    IF v_floor_restriction IS NOT NULL THEN
      RETURN v_floor_restriction;
    END IF;
  END IF;

  -- Priority 3: Item-level restriction
  IF v_item.expected_major_category IS NOT NULL THEN
    v_result := jsonb_build_object(
      'major_category', v_item.expected_major_category,
      'minor_category', v_item.expected_minor_category
    );
    RETURN v_result;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_cell_material_restriction IS
  'Returns material restriction for a specific cell with priority: cell > floor > item.
   Returns JSONB object with major_category and minor_category, or NULL if no restriction.';

-- ============================================================
-- 4. Validation Functions
-- ============================================================

-- Validate floor_material_restrictions structure
CREATE OR REPLACE FUNCTION validate_floor_material_restrictions(
  p_restrictions JSONB,
  p_floors INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_array_length INTEGER;
BEGIN
  -- NULL is valid (no restrictions)
  IF p_restrictions IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Must be an array
  IF jsonb_typeof(p_restrictions) != 'array' THEN
    RETURN FALSE;
  END IF;

  -- Array length must match number of floors
  v_array_length := jsonb_array_length(p_restrictions);
  IF v_array_length != p_floors THEN
    RETURN FALSE;
  END IF;

  -- Each element must be null or object with valid keys
  -- (Additional validation can be added here)

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION validate_floor_material_restrictions IS
  'Validates floor_material_restrictions JSONB structure. Returns true if valid.';

-- Validate cell_material_restrictions structure
CREATE OR REPLACE FUNCTION validate_cell_material_restrictions(
  p_restrictions JSONB,
  p_floors INTEGER,
  p_rows INTEGER,
  p_cols INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_floor_count INTEGER;
BEGIN
  -- NULL is valid (no restrictions)
  IF p_restrictions IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Must be an array
  IF jsonb_typeof(p_restrictions) != 'array' THEN
    RETURN FALSE;
  END IF;

  -- Array length must match number of floors
  v_floor_count := jsonb_array_length(p_restrictions);
  IF v_floor_count != p_floors THEN
    RETURN FALSE;
  END IF;

  -- Additional structural validation can be added here
  -- (checking rows and cols dimensions)

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION validate_cell_material_restrictions IS
  'Validates cell_material_restrictions JSONB structure. Returns true if valid.';

-- ============================================================
-- 5. Comments
-- ============================================================

COMMENT ON COLUMN items.floor_material_restrictions IS
  'Floor-level material restrictions: array of {major_category, minor_category} per floor.
   Example: [{"major_category": "Electronics", "minor_category": "CPU"}, null, ...]
   NULL elements mean no restriction for that floor.
   Priority: This is used if cell_material_restrictions is not set for a specific cell.';

COMMENT ON COLUMN items.cell_material_restrictions IS
  'Cell-level material restrictions: [floor][row][col] structure with {major_category, minor_category}.
   Example: [[[{"major_category": "Electronics", "minor_category": "CPU"}, ...], ...], ...]
   Priority: cell > floor > item level restrictions.
   This provides the most granular control over what materials can be stored in each cell.';

-- ============================================================
-- 6. Grant Permissions
-- ============================================================

GRANT EXECUTE ON FUNCTION get_floor_material_restriction(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cell_material_restriction(UUID, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_floor_material_restrictions(JSONB, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_cell_material_restrictions(JSONB, INTEGER, INTEGER, INTEGER) TO authenticated;

-- ============================================================
-- Migration Complete!
-- Next: Run 49_material_category_capacities_mv.sql to create the MV
-- ============================================================
