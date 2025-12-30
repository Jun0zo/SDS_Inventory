-- Material Category Capacities Materialized View
-- Purpose: Calculate remaining capacity for each material category (major/minor) per zone
-- Performance: Pre-aggregates capacity by material category for fast dashboard queries
-- Calculation: Based on item count (WMS row count), respecting cell/floor/item-level restrictions

-- Drop existing view if exists
DROP MATERIALIZED VIEW IF EXISTS public.mv_material_category_capacities CASCADE;

-- Create materialized view for material category capacities
CREATE MATERIALIZED VIEW public.mv_material_category_capacities AS
WITH cell_expansions AS (
  -- Expand each rack item into individual cells with their material restrictions
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
    ) AS expected_minor
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
    i.expected_minor_category AS expected_minor
  FROM items i
  WHERE i.type = 'flat'
),
current_stock_by_cell AS (
  -- Match actual WMS data to cells and count items by material category
  SELECT
    ce.item_id,
    ce.warehouse_id,
    ce.zone,
    ce.floor_idx,
    ce.row_idx,
    ce.col_idx,
    ce.expected_major,
    ce.expected_minor,
    ce.cell_capacity,
    ce.cell_available,
    m.major_category AS actual_major,
    m.minor_category AS actual_minor,
    -- Count distinct WMS rows (item count basis)
    COUNT(DISTINCT w.id) AS current_count
  FROM cell_expansions ce
  LEFT JOIN wms_raw_rows w ON
    normalize_zone_code(w.split_key) = normalize_zone_code(ce.zone)
    AND (
      -- Rack: match specific cell location (e.g., "A35-01-02")
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
    ce.expected_major, ce.expected_minor,
    ce.cell_capacity, ce.cell_available,
    m.major_category, m.minor_category
),
zone_material_summary AS (
  -- Aggregate capacity by zone and material category
  SELECT
    warehouse_id,
    zone,
    expected_major,
    expected_minor,
    -- Total capacity for this material category
    SUM(cell_capacity) AS total_capacity,
    -- Current stock (only count items matching expected category)
    SUM(
      CASE
        WHEN actual_major IS NULL THEN 0  -- Empty cell
        WHEN expected_major = 'any' OR expected_major IS NULL THEN current_count
        WHEN actual_major = expected_major THEN
          -- Check minor category if specified
          CASE
            WHEN expected_minor IS NULL OR expected_minor = 'any' THEN current_count
            WHEN actual_minor = expected_minor THEN current_count
            ELSE 0  -- Minor category mismatch
          END
        ELSE 0  -- Major category mismatch
      END
    ) AS current_stock,
    -- Count items with mismatched materials
    SUM(
      CASE
        WHEN actual_major IS NULL THEN 0
        WHEN expected_major = 'any' OR expected_major IS NULL THEN 0
        WHEN actual_major != expected_major THEN current_count
        WHEN expected_minor IS NOT NULL AND expected_minor != 'any'
             AND actual_minor != expected_minor THEN current_count
        ELSE 0
      END
    ) AS mismatched_stock,
    -- Number of distinct items contributing to this category
    COUNT(DISTINCT item_id) AS item_count,
    -- Number of cells for this category
    COUNT(*) FILTER (WHERE cell_capacity > 0) AS cell_count
  FROM current_stock_by_cell
  WHERE expected_major IS NOT NULL AND expected_major != 'any'
  GROUP BY warehouse_id, zone, expected_major, expected_minor
)
SELECT
  warehouse_id,
  zone,
  expected_major AS major_category,
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

-- Unique index on warehouse_id, zone, major, and minor (coalesced for NULL)
CREATE UNIQUE INDEX idx_mv_material_category_capacities_pk
  ON public.mv_material_category_capacities(
    warehouse_id,
    zone,
    major_category,
    COALESCE(minor_category, '')
  );

-- Index for filtering by zone
CREATE INDEX idx_mv_material_category_capacities_zone
  ON public.mv_material_category_capacities(zone);

-- Index for filtering by major category
CREATE INDEX idx_mv_material_category_capacities_major
  ON public.mv_material_category_capacities(major_category);

-- Index for filtering by utilization
CREATE INDEX idx_mv_material_category_capacities_utilization
  ON public.mv_material_category_capacities(utilization_percentage DESC);

-- Index for filtering by remaining capacity
CREATE INDEX idx_mv_material_category_capacities_remaining
  ON public.mv_material_category_capacities(remaining_capacity DESC);

-- ============================================================
-- Refresh Functions
-- ============================================================

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_material_category_capacities()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_material_category_capacities;
  RAISE NOTICE 'Material category capacities materialized view refreshed at %', NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Automatic Refresh Triggers
-- ============================================================

-- Trigger function to refresh MV when related data changes
CREATE OR REPLACE FUNCTION trigger_refresh_material_category_capacities()
RETURNS TRIGGER AS $$
BEGIN
  -- Refresh materialized view (blocking operation within transaction)
  PERFORM refresh_material_category_capacities();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Refresh when items' material restriction columns change
DROP TRIGGER IF EXISTS trigger_items_material_restrictions_refresh ON items;
CREATE TRIGGER trigger_items_material_restrictions_refresh
  AFTER UPDATE OF floor_material_restrictions, cell_material_restrictions, expected_major_category, expected_minor_category ON items
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_material_category_capacities();

-- Refresh when cell_capacity or cell_availability changes
DROP TRIGGER IF EXISTS trigger_items_capacity_refresh ON items;
CREATE TRIGGER trigger_items_capacity_refresh
  AFTER UPDATE OF cell_capacity, cell_availability, max_capacity ON items
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_material_category_capacities();

-- Refresh when wms_raw_rows change (affects current stock)
DROP TRIGGER IF EXISTS trigger_wms_material_capacities_refresh ON wms_raw_rows;
CREATE TRIGGER trigger_wms_material_capacities_refresh
  AFTER INSERT OR UPDATE OR DELETE ON wms_raw_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_material_category_capacities();

-- Refresh when materials change (affects category matching)
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
  'Pre-calculated capacity remaining for each material category (major/minor) per zone.

   Key columns:
   - warehouse_id, zone: Location identifiers
   - major_category, minor_category: Material category restrictions
   - total_capacity: Total number of item slots for this category (sum of cell capacities)
   - current_stock: Current number of correctly categorized items
   - mismatched_stock: Number of items with wrong material category
   - remaining_capacity: Available slots (total - current - mismatched)
   - utilization_percentage: (current + mismatched) / total * 100
   - proper_utilization_percentage: current / total * 100 (excluding mismatched)

   Calculation logic:
   - Expands each rack into individual cells
   - Applies material restrictions with priority: cell > floor > item
   - Matches WMS data to specific cells by parsing cell_no
   - Counts items (WMS row count basis), not quantities
   - Only includes cells with capacity > 0 and availability = true

   Refresh triggers:
   - Auto-refreshes when items material restrictions, capacity, or availability change
   - Auto-refreshes when wms_raw_rows or materials tables change
   - Manual refresh: SELECT refresh_material_category_capacities();';

COMMENT ON FUNCTION refresh_material_category_capacities IS
  'Refreshes the mv_material_category_capacities materialized view concurrently (non-blocking).
   Call this function after bulk updates or to ensure latest data.';

-- ============================================================
-- Initial Refresh
-- ============================================================

-- Perform initial refresh (non-concurrent, since this is the first refresh)
-- After the unique index is created, we can use concurrent refresh
REFRESH MATERIALIZED VIEW public.mv_material_category_capacities;

-- ============================================================
-- Debug Queries (commented out - uncomment to test)
-- ============================================================

-- Check material category capacities for a specific zone
-- SELECT * FROM mv_material_category_capacities
-- WHERE zone = 'F03'
-- ORDER BY major_category, minor_category;

-- Find zones with low remaining capacity for a specific material
-- SELECT zone, major_category, minor_category, remaining_capacity, utilization_percentage
-- FROM mv_material_category_capacities
-- WHERE major_category = 'Electronics'
--   AND remaining_capacity < 10
-- ORDER BY remaining_capacity ASC;

-- Summary by major category across all zones
-- SELECT
--   major_category,
--   SUM(total_capacity) AS total,
--   SUM(current_stock) AS current,
--   SUM(remaining_capacity) AS remaining,
--   ROUND(AVG(utilization_percentage), 2) AS avg_utilization
-- FROM mv_material_category_capacities
-- GROUP BY major_category
-- ORDER BY major_category;
