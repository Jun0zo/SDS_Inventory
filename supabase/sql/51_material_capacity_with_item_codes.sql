-- Material Category Capacities MV with Item Code Support
-- Extends the existing MV to support specific item code restrictions
-- Matching logic: Category Match OR Item Code Match = correct
--
-- Run this AFTER 13_add_expected_item_codes.sql migration

-- Drop existing view to recreate with new logic
DROP MATERIALIZED VIEW IF EXISTS public.mv_material_category_capacities CASCADE;

-- Recreate with item code support
CREATE MATERIALIZED VIEW public.mv_material_category_capacities AS
WITH cell_expansions AS (
  -- Expand each rack item into individual cells with their restrictions
  SELECT
    i.id AS item_id,
    i.warehouse_id,
    i.zone,
    i.location,
    i.type,
    floor_idx,
    row_idx,
    col_idx,
    -- Get cell capacity
    get_cell_capacity_from_jsonb(i.cell_capacity, floor_idx + 1, col_idx + 1) AS cell_capacity,
    -- Get cell availability
    get_cell_availability_from_jsonb(i.cell_availability, floor_idx + 1, col_idx + 1) AS cell_available,
    -- Get material restriction with priority: cell > floor > item
    COALESCE(
      (i.cell_material_restrictions->floor_idx->row_idx->col_idx->>'major_category')::TEXT,
      (i.floor_material_restrictions->floor_idx->>'major_category')::TEXT,
      i.expected_major_category
    ) AS expected_major,
    COALESCE(
      (i.cell_material_restrictions->floor_idx->row_idx->col_idx->>'minor_category')::TEXT,
      (i.floor_material_restrictions->floor_idx->>'minor_category')::TEXT,
      i.expected_minor_category
    ) AS expected_minor,
    -- Get item code restrictions with priority: cell > floor > item
    COALESCE(
      -- Cell-level item codes
      (SELECT array_agg(code) FROM jsonb_array_elements_text(
        i.cell_item_codes->floor_idx->row_idx->col_idx
      ) AS code WHERE code IS NOT NULL),
      -- Floor-level item codes
      (SELECT array_agg(code) FROM jsonb_array_elements_text(
        i.floor_item_codes->floor_idx
      ) AS code WHERE code IS NOT NULL),
      -- Item-level item codes
      i.expected_item_codes
    ) AS expected_item_codes
  FROM items i
  CROSS JOIN LATERAL generate_series(0, GREATEST(i.floors - 1, 0)) AS floor_idx
  CROSS JOIN LATERAL generate_series(0, GREATEST(i.rows - 1, 0)) AS row_idx
  CROSS JOIN LATERAL generate_series(0, GREATEST(i.cols - 1, 0)) AS col_idx
  WHERE i.type = 'rack'

  UNION ALL

  -- Flat items: single entry with total capacity
  SELECT
    i.id AS item_id,
    i.warehouse_id,
    i.zone,
    i.location,
    i.type,
    NULL AS floor_idx,
    NULL AS row_idx,
    NULL AS col_idx,
    i.max_capacity AS cell_capacity,
    TRUE AS cell_available,
    i.expected_major_category AS expected_major,
    i.expected_minor_category AS expected_minor,
    i.expected_item_codes AS expected_item_codes
  FROM items i
  WHERE i.type = 'flat'
),
current_stock_by_cell AS (
  -- Match actual WMS data to cells and count items
  SELECT
    ce.item_id,
    ce.warehouse_id,
    ce.zone,
    ce.floor_idx,
    ce.row_idx,
    ce.col_idx,
    ce.expected_major,
    ce.expected_minor,
    ce.expected_item_codes,
    ce.cell_capacity,
    ce.cell_available,
    m.major_category AS actual_major,
    m.minor_category AS actual_minor,
    w.item_code AS actual_item_code,
    -- Count distinct WMS rows (item count basis)
    COUNT(DISTINCT w.id) AS current_count
  FROM cell_expansions ce
  LEFT JOIN wms_raw_rows w ON
    normalize_zone_code(w.split_key) = normalize_zone_code(ce.zone)
    AND (
      -- Rack: match specific cell location
      (ce.type = 'rack' AND ce.floor_idx IS NOT NULL AND ce.col_idx IS NOT NULL AND
       UPPER(TRIM(w.cell_no)) = UPPER(TRIM(ce.location)) || '-' ||
       LPAD((ce.floor_idx + 1)::TEXT, 2, '0') || '-' ||
       LPAD((ce.col_idx + 1)::TEXT, 2, '0'))
      OR
      -- Flat: match entire location
      (ce.type = 'flat' AND UPPER(TRIM(w.cell_no)) = UPPER(TRIM(ce.location)))
    )
  LEFT JOIN materials m ON m.item_code = w.item_code
  WHERE ce.cell_capacity > 0  -- Exclude cells with zero capacity
    AND ce.cell_available = TRUE  -- Exclude blocked cells
  GROUP BY
    ce.item_id, ce.warehouse_id, ce.zone,
    ce.floor_idx, ce.row_idx, ce.col_idx,
    ce.expected_major, ce.expected_minor, ce.expected_item_codes,
    ce.cell_capacity, ce.cell_available,
    m.major_category, m.minor_category, w.item_code
),
zone_material_summary AS (
  -- Aggregate capacity by zone and material category
  SELECT
    warehouse_id,
    zone,
    expected_major,
    expected_minor,
    -- Total capacity for this restriction
    SUM(cell_capacity) AS total_capacity,
    -- Current stock: items that match category OR item code
    SUM(
      CASE
        WHEN actual_major IS NULL AND actual_item_code IS NULL THEN 0  -- Empty cell

        -- Item code match (highest priority if codes are specified)
        WHEN expected_item_codes IS NOT NULL
             AND array_length(expected_item_codes, 1) > 0
             AND actual_item_code = ANY(expected_item_codes)
        THEN current_count

        -- Category match (if no item codes or item code didn't match)
        WHEN expected_major = 'any' OR expected_major IS NULL THEN current_count
        WHEN actual_major = expected_major THEN
          CASE
            WHEN expected_minor IS NULL OR expected_minor = 'any' THEN current_count
            WHEN actual_minor = expected_minor THEN current_count
            ELSE 0  -- Minor category mismatch
          END

        ELSE 0  -- No match
      END
    ) AS current_stock,
    -- Mismatched stock: items that don't match either category or item code
    SUM(
      CASE
        WHEN actual_major IS NULL AND actual_item_code IS NULL THEN 0

        -- Check if matches item codes
        WHEN expected_item_codes IS NOT NULL
             AND array_length(expected_item_codes, 1) > 0
             AND actual_item_code = ANY(expected_item_codes)
        THEN 0  -- Matched by item code

        -- Check if matches category
        WHEN expected_major = 'any' OR expected_major IS NULL THEN 0
        WHEN actual_major = expected_major THEN
          CASE
            WHEN expected_minor IS NULL OR expected_minor = 'any' THEN 0
            WHEN actual_minor = expected_minor THEN 0
            ELSE current_count  -- Minor mismatch
          END

        ELSE current_count  -- Major mismatch and no item code match
      END
    ) AS mismatched_stock,
    -- Count distinct items and cells
    COUNT(DISTINCT item_id) AS item_count,
    COUNT(*) FILTER (WHERE cell_capacity > 0) AS cell_count
  FROM current_stock_by_cell
  WHERE (expected_major IS NOT NULL AND expected_major != 'any')
     OR (expected_item_codes IS NOT NULL AND array_length(expected_item_codes, 1) > 0)
  GROUP BY warehouse_id, zone, expected_major, expected_minor
)
SELECT
  warehouse_id,
  zone,
  COALESCE(expected_major, 'Item Code Only') AS major_category,
  expected_minor AS minor_category,
  total_capacity,
  current_stock,
  mismatched_stock,
  (total_capacity - current_stock - mismatched_stock) AS remaining_capacity,
  -- Utilization percentage (current + mismatched / total)
  CASE
    WHEN total_capacity > 0 THEN
      ROUND(((current_stock + mismatched_stock)::NUMERIC / total_capacity::NUMERIC * 100), 2)
    ELSE 0
  END AS utilization_percentage,
  -- Proper utilization percentage (excluding mismatched)
  CASE
    WHEN total_capacity > 0 THEN
      ROUND((current_stock::NUMERIC / total_capacity::NUMERIC * 100), 2)
    ELSE 0
  END AS proper_utilization_percentage,
  item_count,
  cell_count,
  NOW() AS last_updated
FROM zone_material_summary;

-- ============================================================
-- Indexes for Performance
-- ============================================================

-- Unique index for concurrent refresh
CREATE UNIQUE INDEX idx_mv_material_category_capacities_pk
  ON public.mv_material_category_capacities(
    warehouse_id,
    zone,
    major_category,
    minor_category
  );

-- Additional indexes
CREATE INDEX idx_mv_material_category_capacities_zone
  ON public.mv_material_category_capacities(zone);

CREATE INDEX idx_mv_material_category_capacities_major
  ON public.mv_material_category_capacities(major_category);

CREATE INDEX idx_mv_material_category_capacities_utilization
  ON public.mv_material_category_capacities(utilization_percentage DESC);

CREATE INDEX idx_mv_material_category_capacities_remaining
  ON public.mv_material_category_capacities(remaining_capacity DESC);

-- ============================================================
-- Update Trigger Function
-- ============================================================

-- Drop existing trigger function
DROP FUNCTION IF EXISTS trigger_refresh_material_category_capacities() CASCADE;

-- Recreate with error handling
CREATE OR REPLACE FUNCTION trigger_refresh_material_category_capacities()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if materialized view exists before refreshing
  IF EXISTS (
    SELECT 1
    FROM pg_matviews
    WHERE schemaname = 'public'
    AND matviewname = 'mv_material_category_capacities'
  ) THEN
    BEGIN
      PERFORM refresh_material_category_capacities();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to refresh mv_material_category_capacities: %', SQLERRM;
    END;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Recreate Triggers
-- ============================================================

-- Items: material restrictions and item codes
DROP TRIGGER IF EXISTS trigger_items_material_restrictions_refresh ON items;
CREATE TRIGGER trigger_items_material_restrictions_refresh
  AFTER UPDATE OF floor_material_restrictions, cell_material_restrictions,
                 expected_major_category, expected_minor_category,
                 expected_item_codes, floor_item_codes, cell_item_codes ON items
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_material_category_capacities();

-- Items: capacity changes
DROP TRIGGER IF EXISTS trigger_items_capacity_refresh ON items;
CREATE TRIGGER trigger_items_capacity_refresh
  AFTER UPDATE OF cell_capacity, cell_availability, max_capacity ON items
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_material_category_capacities();

-- WMS data changes
DROP TRIGGER IF EXISTS trigger_wms_material_capacities_refresh ON wms_raw_rows;
CREATE TRIGGER trigger_wms_material_capacities_refresh
  AFTER INSERT OR UPDATE OR DELETE ON wms_raw_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_material_category_capacities();

-- Materials changes
DROP TRIGGER IF EXISTS trigger_materials_capacities_refresh ON materials;
CREATE TRIGGER trigger_materials_capacities_refresh
  AFTER INSERT OR UPDATE OR DELETE ON materials
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_material_category_capacities();

-- ============================================================
-- Permissions
-- ============================================================

GRANT SELECT ON public.mv_material_category_capacities TO authenticated, anon;
GRANT EXECUTE ON FUNCTION refresh_material_category_capacities() TO authenticated;

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON MATERIALIZED VIEW public.mv_material_category_capacities IS
  'Pre-calculated capacity for material categories with item code support.

   Matching logic:
   - Item matches if: category matches OR item_code is in expected_item_codes
   - Priority: cell > floor > item level restrictions
   - Allows mixed mode (category + specific item codes)

   Key columns:
   - major_category: "Item Code Only" when no category but item codes are set
   - current_stock: Items matching either category OR item code
   - mismatched_stock: Items matching neither

   Use cases:
   1. Category only: expected_major_category = "Glass"
   2. Item codes only: expected_item_codes = ["ITEM-001", "ITEM-002"]
   3. Mixed: Category "Glass" + specific item codes ["METAL-123"]';

-- ============================================================
-- Initial Refresh
-- ============================================================

REFRESH MATERIALIZED VIEW public.mv_material_category_capacities;
