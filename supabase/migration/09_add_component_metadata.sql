-- Migration: Add component metadata using existing items table
-- No new tables needed - just add columns to items and create MV

-- ============================================================
-- 1. Add Columns to items Table
-- ============================================================
-- Add expected materials and production line feeds to items
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS expected_major_category TEXT,
  ADD COLUMN IF NOT EXISTS expected_minor_category TEXT,
  ADD COLUMN IF NOT EXISTS feeds_production_line_ids UUID[];

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_items_expected_major
  ON items(expected_major_category)
  WHERE expected_major_category IS NOT NULL AND expected_major_category != 'any';

CREATE INDEX IF NOT EXISTS idx_items_feeds_production_lines
  ON items USING GIN(feeds_production_line_ids)
  WHERE feeds_production_line_ids IS NOT NULL;

-- Performance indexes for MV queries
CREATE INDEX IF NOT EXISTS idx_items_warehouse_zone
  ON items(warehouse_id, zone);

-- ============================================================
-- 2. Materialized View: Component Metadata
-- ============================================================
-- Pre-computes all metadata for fast querying
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_component_metadata AS
WITH actual_materials AS (
  SELECT
    i.id AS item_id,
    i.location,
    i.zone,
    ARRAY_AGG(DISTINCT m.major_category) FILTER (WHERE m.major_category IS NOT NULL) AS actual_major_categories,
    ARRAY_AGG(DISTINCT m.minor_category) FILTER (WHERE m.minor_category IS NOT NULL) AS actual_minor_categories,
    COUNT(DISTINCT w.item_code)::BIGINT AS actual_item_count
  FROM items i
  LEFT JOIN wms_raw_rows w ON
    UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i.location)) || '(-[0-9]+-[0-9]+)?$')
    AND normalize_zone_code(w.zone) = normalize_zone_code(i.zone)
  LEFT JOIN materials m ON m.item_code = w.item_code
  GROUP BY i.id, i.location, i.zone
),
unassigned_counts AS (
  SELECT
    i.id AS item_id,
    COUNT(DISTINCT w.cell_no)::BIGINT AS unassigned_count
  FROM items i
  JOIN wms_raw_rows w ON
    UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i.location)) || '(-[0-9]+-[0-9]+)?$')
    AND normalize_zone_code(w.zone) = normalize_zone_code(i.zone)
  WHERE EXISTS (
    SELECT 1
    FROM warehouse_bindings wb,
         LATERAL jsonb_each(wb.source_bindings) as binding
    WHERE wb.warehouse_id = i.warehouse_id
      AND binding.value->>'type' = 'wms'
      AND (w.source_id::text || CASE
        WHEN w.split_key IS NOT NULL THEN '::' || w.split_key
        ELSE ''
      END) = binding.key
  )
  GROUP BY i.id
),
production_line_feeds_agg AS (
  SELECT
    i.id AS item_id,
    jsonb_agg(jsonb_build_object(
      'id', pl.id,
      'production_line_id', pl.id,
      'line_code', pl.line_code,
      'line_name', pl.line_name,
      'factory_name', f.name,
      'daily_capacity', pl.daily_production_capacity
    )) AS feeds
  FROM items i
  CROSS JOIN LATERAL unnest(COALESCE(i.feeds_production_line_ids, ARRAY[]::UUID[])) AS line_id
  JOIN production_lines pl ON pl.id = line_id
  LEFT JOIN factories f ON f.id = pl.factory_id
  GROUP BY i.id
)
SELECT
  i.id AS item_id,
  i.warehouse_id,
  i.location,
  i.zone,

  -- Expected materials (from items table)
  i.expected_major_category,
  i.expected_minor_category,
  i.expected_item_codes,

  -- Actual materials
  am.actual_major_categories,
  am.actual_minor_categories,
  COALESCE(am.actual_item_count, 0) AS actual_item_count,

  -- Material variance check
  CASE
    WHEN i.expected_major_category IS NULL OR i.expected_major_category = 'any' THEN false
    WHEN am.actual_major_categories IS NULL THEN false
    WHEN EXISTS (
      SELECT 1
      FROM unnest(am.actual_major_categories) AS cat
      WHERE cat != i.expected_major_category
    ) THEN true
    WHEN i.expected_minor_category IS NOT NULL
      AND i.expected_minor_category != 'any'
      AND EXISTS (
        SELECT 1
        FROM unnest(am.actual_minor_categories) AS cat
        WHERE cat != i.expected_minor_category
      ) THEN true
    ELSE false
  END AS has_material_variance,

  -- Unassigned locations
  COALESCE(uc.unassigned_count, 0) AS unassigned_locations_count,
  COALESCE(uc.unassigned_count, 0) > 0 AS has_unassigned_locations,

  -- Production lines (from items table)
  COALESCE(array_length(i.feeds_production_line_ids, 1), 0) AS production_line_count,
  COALESCE(plf.feeds, '[]'::jsonb) AS production_line_feeds

FROM items i
LEFT JOIN actual_materials am ON am.item_id = i.id
LEFT JOIN unassigned_counts uc ON uc.item_id = i.id
LEFT JOIN production_line_feeds_agg plf ON plf.item_id = i.id;

-- Indexes for fast querying
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_component_metadata_item_id
  ON mv_component_metadata(item_id);
CREATE INDEX IF NOT EXISTS idx_mv_component_metadata_warehouse_zone
  ON mv_component_metadata(warehouse_id, zone);
CREATE INDEX IF NOT EXISTS idx_mv_component_metadata_variance
  ON mv_component_metadata(has_material_variance) WHERE has_material_variance = true;
CREATE INDEX IF NOT EXISTS idx_mv_component_metadata_unassigned
  ON mv_component_metadata(has_unassigned_locations) WHERE has_unassigned_locations = true;

-- ============================================================
-- 3. Function to Refresh Component Metadata MV
-- ============================================================
-- Call this after updating items or periodically
CREATE OR REPLACE FUNCTION refresh_component_metadata()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_component_metadata;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. Trigger to Auto-Refresh MV
-- ============================================================
-- Trigger function to refresh MV when related data changes
CREATE OR REPLACE FUNCTION trigger_refresh_component_metadata()
RETURNS TRIGGER AS $$
BEGIN
  -- Refresh materialized view (blocking operation within transaction)
  PERFORM refresh_component_metadata();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Only refresh when metadata columns change
CREATE TRIGGER trigger_items_metadata_refresh
  AFTER UPDATE OF expected_major_category, expected_minor_category, feeds_production_line_ids ON items
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_component_metadata();

-- Refresh when wms_raw_rows change (affects actual materials and unassigned counts)
CREATE TRIGGER trigger_wms_rows_metadata_refresh
  AFTER INSERT OR UPDATE OR DELETE ON wms_raw_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_component_metadata();

-- Refresh when materials change (affects material categories)
CREATE TRIGGER trigger_materials_metadata_refresh
  AFTER INSERT OR UPDATE OR DELETE ON materials
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_component_metadata();

-- Refresh when production_lines change (affects production line feeds)
CREATE TRIGGER trigger_production_lines_metadata_refresh
  AFTER INSERT OR UPDATE OR DELETE ON production_lines
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_component_metadata();

-- Initial refresh
SELECT refresh_component_metadata();

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON COLUMN items.expected_major_category IS
  'Expected major material category for this location. Use ''any'' for wildcard.';

COMMENT ON COLUMN items.expected_minor_category IS
  'Expected minor material category for this location. Use ''any'' for wildcard.';

COMMENT ON COLUMN items.feeds_production_line_ids IS
  'Array of production line UUIDs that this location supplies materials to.';

COMMENT ON MATERIALIZED VIEW mv_component_metadata IS
  'Pre-computed metadata for all components including materials, variance, unassigned locations, and production line feeds. Refreshed automatically via triggers when items table metadata columns change.';

COMMENT ON FUNCTION refresh_component_metadata IS
  'Refreshes the mv_component_metadata materialized view. Called automatically by triggers or manually for bulk operations.';
