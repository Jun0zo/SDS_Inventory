-- Debug Material Category Capacities
-- Run this to check if the MV is calculating correctly

-- 1. Check if MV has data
SELECT
  zone,
  major_category,
  minor_category,
  total_capacity,
  current_stock,
  remaining_capacity,
  utilization_percentage
FROM mv_material_category_capacities
ORDER BY zone, major_category, minor_category
LIMIT 20;

-- 2. Check items with expected materials set
SELECT
  id,
  location,
  zone,
  type,
  expected_major_category,
  expected_minor_category,
  CASE
    WHEN type = 'rack' THEN floors * rows * cols
    ELSE max_capacity
  END as calculated_capacity
FROM items
WHERE expected_major_category IS NOT NULL
ORDER BY zone, location
LIMIT 20;

-- 3. Check cell expansions for a specific item (replace with actual item location)
-- This shows how the MV expands cells
WITH cell_expansions AS (
  SELECT
    i.id,
    i.location,
    i.zone,
    i.type,
    floor_idx,
    col_idx,
    get_cell_capacity_from_jsonb(i.cell_capacity, floor_idx + 1, col_idx + 1) AS cell_capacity,
    COALESCE(
      (i.cell_material_restrictions->floor_idx->0->col_idx->>'major_category')::TEXT,
      (i.floor_material_restrictions->floor_idx->>'major_category')::TEXT,
      i.expected_major_category
    ) AS expected_major
  FROM items i
  CROSS JOIN LATERAL generate_series(0, GREATEST(i.floors - 1, 0)) AS floor_idx
  CROSS JOIN LATERAL generate_series(0, GREATEST(i.cols - 1, 0)) AS col_idx
  WHERE i.type = 'rack'
    AND i.expected_major_category IS NOT NULL
  LIMIT 100
)
SELECT
  location,
  zone,
  expected_major,
  COUNT(*) as cell_count,
  SUM(cell_capacity) as total_capacity
FROM cell_expansions
GROUP BY location, zone, expected_major
ORDER BY location;

-- 4. Check if there's a mismatch between items table and MV
SELECT
  i.zone,
  i.expected_major_category,
  COUNT(*) as item_count,
  SUM(CASE WHEN i.type = 'rack' THEN i.floors * i.rows * i.cols ELSE i.max_capacity END) as total_from_items,
  COALESCE(mv.total_capacity, 0) as total_from_mv
FROM items i
LEFT JOIN mv_material_category_capacities mv
  ON mv.zone = i.zone
  AND mv.major_category = i.expected_major_category
WHERE i.expected_major_category IS NOT NULL
GROUP BY i.zone, i.expected_major_category, mv.total_capacity
ORDER BY i.zone, i.expected_major_category;
