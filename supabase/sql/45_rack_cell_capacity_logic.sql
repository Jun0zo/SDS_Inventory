-- Rack Cell Capacity Logic
-- Purpose: Enable capacity-aware stock counting for racks
-- - If cell capacity = 1: count as 1 stock (regardless of ULD count)
-- - If cell capacity >= 2: count actual WMS rows

-- Helper function: Parse rack cell location into floor and column indices
-- Format: "A35-01-02" -> rack="A35", floor=1, col=2 (1-based from WMS)
CREATE OR REPLACE FUNCTION parse_rack_cell_location(
  cell_no TEXT,
  OUT rack_code TEXT,
  OUT floor_idx INTEGER,
  OUT col_idx INTEGER
)
RETURNS RECORD AS $$
DECLARE
  parts TEXT[];
BEGIN
  -- Split by hyphen: "A35-01-02" -> ["A35", "01", "02"]
  parts := string_to_array(UPPER(TRIM(cell_no)), '-');

  -- Validate format
  IF array_length(parts, 1) != 3 THEN
    rack_code := NULL;
    floor_idx := NULL;
    col_idx := NULL;
    RETURN;
  END IF;

  rack_code := parts[1];

  -- Parse integers, return 1-based indices (WMS format)
  BEGIN
    floor_idx := parts[2]::INTEGER;
    col_idx := parts[3]::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    floor_idx := NULL;
    col_idx := NULL;
  END;

  RETURN;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION parse_rack_cell_location IS
  'Parses rack cell location string (e.g., "A35-01-02") into rack code, floor index, and column index (1-based)';

-- Helper function: Get cell capacity from JSONB array
-- cellCapacity structure: [floor][col] (0-based indexing)
-- Returns capacity value (0-4), defaulting to 1 if not found
CREATE OR REPLACE FUNCTION get_cell_capacity_from_jsonb(
  cell_capacity_json JSONB,
  floor_idx INTEGER,  -- 1-based from WMS
  col_idx INTEGER     -- 1-based from WMS
)
RETURNS INTEGER AS $$
DECLARE
  capacity INTEGER;
  floor_array JSONB;
  row_array JSONB;
  cell_value JSONB;
BEGIN
  -- Return default if input is null
  IF cell_capacity_json IS NULL THEN
    RETURN 1;
  END IF;

  -- Convert 1-based indices to 0-based for array access
  floor_idx := floor_idx - 1;
  col_idx := col_idx - 1;

  -- Validate indices
  IF floor_idx < 0 OR col_idx < 0 THEN
    RETURN 1;
  END IF;

  -- Extract floor array: cellCapacity[floor]
  floor_array := cell_capacity_json->floor_idx;
  IF floor_array IS NULL OR jsonb_typeof(floor_array) != 'array' THEN
    RETURN 1;
  END IF;

  -- Handle both 2D ([floor][col]) and 3D ([floor][row][col]) payloads
  IF jsonb_typeof(floor_array->0) = 'array' THEN
    -- Use the first row (front-end only stores one row per column today)
    row_array := floor_array->0;
    cell_value := row_array->col_idx;
  ELSE
    cell_value := floor_array->col_idx;
  END IF;

  capacity := (cell_value)::INTEGER;

  -- Return capacity or default to 1
  RETURN COALESCE(capacity, 1);

EXCEPTION WHEN OTHERS THEN
  -- On any error, default to 1
  RETURN 1;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION get_cell_capacity_from_jsonb IS
  'Extracts cell capacity from JSONB array cellCapacity[floor][row][col] (row optional) using 1-based WMS indices. Returns 1 if not found.';

-- Helper function: Determine if a cell is available (not blocked)
CREATE OR REPLACE FUNCTION get_cell_availability_from_jsonb(
  cell_availability_json JSONB,
  floor_idx INTEGER,  -- 1-based from WMS
  col_idx INTEGER     -- 1-based from WMS
)
RETURNS BOOLEAN AS $$
DECLARE
  floor_array JSONB;
  row_array JSONB;
  cell_value JSONB;
BEGIN
  -- Null availability means everything is available (legacy layouts)
  IF cell_availability_json IS NULL THEN
    RETURN TRUE;
  END IF;

  floor_idx := floor_idx - 1;
  col_idx := col_idx - 1;

  IF floor_idx < 0 OR col_idx < 0 THEN
    RETURN TRUE;
  END IF;

  floor_array := cell_availability_json->floor_idx;
  IF floor_array IS NULL OR jsonb_typeof(floor_array) != 'array' THEN
    RETURN TRUE;
  END IF;

  IF jsonb_typeof(floor_array->0) = 'array' THEN
    row_array := floor_array->0;
    cell_value := row_array->col_idx;
  ELSE
    cell_value := floor_array->col_idx;
  END IF;

  IF cell_value IS NULL THEN
    RETURN TRUE;
  END IF;

  RETURN (cell_value)::BOOLEAN;

EXCEPTION WHEN OTHERS THEN
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION get_cell_availability_from_jsonb IS
  'Reads cell availability (true/false) from JSONB array cellAvailability[floor][row][col]; defaults to TRUE when undefined.';

-- Test queries (commented out - uncomment to test):
--
-- Test parse_rack_cell_location:
-- SELECT * FROM parse_rack_cell_location('A35-01-02');
-- Expected: rack_code='A35', floor_idx=1, col_idx=2
--
-- SELECT * FROM parse_rack_cell_location('B1-03-05');
-- Expected: rack_code='B1', floor_idx=3, col_idx=5
--
-- Test get_cell_capacity_from_jsonb:
-- SELECT get_cell_capacity_from_jsonb('[[1,2,3],[4,0,2]]'::jsonb, 1, 2);
-- Expected: 2 (floor 1 = index 0, col 2 = index 1)
--
-- SELECT get_cell_capacity_from_jsonb('[[1,2,3],[4,0,2]]'::jsonb, 2, 3);
-- Expected: 2 (floor 2 = index 1, col 3 = index 2)
--
-- SELECT get_cell_capacity_from_jsonb(NULL, 1, 1);
-- Expected: 1 (default)
