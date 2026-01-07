-- ============================================
-- 15. SEPARATE PRODUCTION LINES FROM WAREHOUSES
-- ============================================
-- This migration separates production_lines from direct warehouse dependency
-- by creating a junction table for many-to-many relationship.
-- A single production line can now be shared across multiple warehouses.

-- ============================================
-- CLEANUP: Drop dependent objects first
-- ============================================
-- Drop triggers that depend on the MV
DROP TRIGGER IF EXISTS trigger_items_metadata_refresh ON items;
DROP TRIGGER IF EXISTS trigger_wms_rows_metadata_refresh ON wms_raw_rows;
DROP TRIGGER IF EXISTS trigger_materials_metadata_refresh ON materials;
DROP TRIGGER IF EXISTS trigger_production_lines_metadata_refresh ON production_lines;

-- Drop the materialized view that depends on production_lines.warehouse_id
DROP MATERIALIZED VIEW IF EXISTS mv_component_metadata CASCADE;

-- ============================================
-- Step 1: Create junction table
-- ============================================
CREATE TABLE IF NOT EXISTS public.warehouse_production_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  production_line_id UUID NOT NULL REFERENCES public.production_lines(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each warehouse-production_line pair must be unique
  UNIQUE(warehouse_id, production_line_id)
);

-- ============================================
-- Step 2: Migrate existing data
-- ============================================
-- Only insert records where the warehouse still exists (skip orphaned records)
INSERT INTO warehouse_production_lines (warehouse_id, production_line_id)
SELECT pl.warehouse_id, pl.id
FROM production_lines pl
INNER JOIN warehouses w ON pl.warehouse_id = w.id
WHERE pl.warehouse_id IS NOT NULL
ON CONFLICT (warehouse_id, production_line_id) DO NOTHING;

-- ============================================
-- Step 3: Drop constraints from production_lines
-- ============================================
ALTER TABLE production_lines DROP CONSTRAINT IF EXISTS production_lines_warehouse_id_fkey;
ALTER TABLE production_lines DROP CONSTRAINT IF EXISTS production_lines_warehouse_id_line_code_key;

-- ============================================
-- Step 4: Add global unique constraint on line_code
-- ============================================
DO $$
BEGIN
  -- Check for duplicate line_codes
  IF EXISTS (
    SELECT line_code, COUNT(*)
    FROM production_lines
    GROUP BY line_code
    HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Warning: Duplicate line_codes found. Adding suffix to make them unique.';

    -- Add warehouse_id suffix to duplicate line_codes to make them unique
    WITH duplicates AS (
      SELECT id, line_code, warehouse_id,
             ROW_NUMBER() OVER (PARTITION BY line_code ORDER BY created_at) as rn
      FROM production_lines
    )
    UPDATE production_lines pl
    SET line_code = pl.line_code || '_' || SUBSTRING(pl.warehouse_id::text, 1, 8)
    FROM duplicates d
    WHERE pl.id = d.id AND d.rn > 1;
  END IF;

  -- Now add the unique constraint
  ALTER TABLE production_lines ADD CONSTRAINT production_lines_line_code_key UNIQUE(line_code);
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Constraint production_lines_line_code_key already exists';
END $$;

-- ============================================
-- Step 5: Drop warehouse_id column
-- ============================================
ALTER TABLE production_lines DROP COLUMN IF EXISTS warehouse_id;

-- ============================================
-- Step 6: Create indexes for junction table
-- ============================================
CREATE INDEX IF NOT EXISTS idx_wpl_warehouse_id ON public.warehouse_production_lines(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wpl_production_line_id ON public.warehouse_production_lines(production_line_id);

-- ============================================
-- Step 7: Enable RLS on junction table
-- ============================================
ALTER TABLE public.warehouse_production_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "warehouse_production_lines_allow_all" ON public.warehouse_production_lines;
CREATE POLICY "warehouse_production_lines_allow_all"
  ON public.warehouse_production_lines
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- Step 8: Recreate mv_component_metadata with junction table
-- ============================================
CREATE MATERIALIZED VIEW mv_component_metadata AS
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
      'factory_name', COALESCE(
        (SELECT string_agg(wh.name, ', ' ORDER BY wh.name)
         FROM warehouse_production_lines wpl
         JOIN warehouses wh ON wh.id = wpl.warehouse_id
         WHERE wpl.production_line_id = pl.id),
        'Unassigned'
      ),
      'daily_capacity', pl.daily_production_capacity
    )) AS feeds
  FROM items i
  CROSS JOIN LATERAL unnest(COALESCE(i.feeds_production_line_ids, ARRAY[]::UUID[])) AS line_id
  JOIN production_lines pl ON pl.id = line_id
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
CREATE UNIQUE INDEX idx_mv_component_metadata_item_id
  ON mv_component_metadata(item_id);
CREATE INDEX idx_mv_component_metadata_warehouse_zone
  ON mv_component_metadata(warehouse_id, zone);
CREATE INDEX idx_mv_component_metadata_variance
  ON mv_component_metadata(has_material_variance) WHERE has_material_variance = true;
CREATE INDEX idx_mv_component_metadata_unassigned
  ON mv_component_metadata(has_unassigned_locations) WHERE has_unassigned_locations = true;

-- ============================================
-- Step 9: Recreate triggers for MV refresh
-- ============================================
-- Trigger function already exists, just recreate triggers
CREATE TRIGGER trigger_items_metadata_refresh
  AFTER UPDATE OF expected_major_category, expected_minor_category, feeds_production_line_ids ON items
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_component_metadata();

CREATE TRIGGER trigger_wms_rows_metadata_refresh
  AFTER INSERT OR UPDATE OR DELETE ON wms_raw_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_component_metadata();

CREATE TRIGGER trigger_materials_metadata_refresh
  AFTER INSERT OR UPDATE OR DELETE ON materials
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_component_metadata();

CREATE TRIGGER trigger_production_lines_metadata_refresh
  AFTER INSERT OR UPDATE OR DELETE ON production_lines
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_component_metadata();

-- ============================================
-- Step 10: Add comments
-- ============================================
COMMENT ON TABLE public.warehouse_production_lines IS 'Junction table linking warehouses to production lines (many-to-many)';
COMMENT ON COLUMN public.warehouse_production_lines.warehouse_id IS 'Reference to warehouses table';
COMMENT ON COLUMN public.warehouse_production_lines.production_line_id IS 'Reference to production_lines table';

-- ============================================
-- Step 11: Cleanup old index
-- ============================================
DROP INDEX IF EXISTS idx_production_lines_warehouse_id;

-- ============================================
-- Step 12: Refresh the MV
-- ============================================
REFRESH MATERIALIZED VIEW mv_component_metadata;
