-- ============================================
-- 16. ADD FACTORIES TABLE
-- ============================================
-- This migration creates the factories table and migrates
-- production lines from warehouse dependency to factory dependency.

-- ============================================
-- Step 1: Create factories table
-- ============================================
CREATE TABLE IF NOT EXISTS public.factories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.factories ENABLE ROW LEVEL SECURITY;

-- Create permissive RLS policy
DROP POLICY IF EXISTS "factories_allow_all" ON public.factories;
CREATE POLICY "factories_allow_all"
  ON public.factories
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_factories_code ON public.factories(code);
CREATE INDEX IF NOT EXISTS idx_factories_created_at ON public.factories(created_at);

-- ============================================
-- Step 2: Add factory_id to production_lines
-- ============================================
ALTER TABLE public.production_lines
  ADD COLUMN IF NOT EXISTS factory_id UUID REFERENCES public.factories(id) ON DELETE CASCADE;

-- Create index for factory_id
CREATE INDEX IF NOT EXISTS idx_production_lines_factory_id ON public.production_lines(factory_id);

-- ============================================
-- Step 3: Drop warehouse_production_lines junction table
-- ============================================
-- This table is no longer needed as production lines now belong to factories
DROP TABLE IF EXISTS public.warehouse_production_lines CASCADE;

-- ============================================
-- Step 4: Update mv_component_metadata to handle factory
-- ============================================
-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_items_metadata_refresh ON items;
DROP TRIGGER IF EXISTS trigger_wms_rows_metadata_refresh ON wms_raw_rows;
DROP TRIGGER IF EXISTS trigger_materials_metadata_refresh ON materials;
DROP TRIGGER IF EXISTS trigger_production_lines_metadata_refresh ON production_lines;

-- Drop and recreate MV
DROP MATERIALIZED VIEW IF EXISTS mv_component_metadata CASCADE;

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
      'factory_name', COALESCE(f.name, 'Unassigned'),
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

-- Recreate triggers
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
-- Step 5: Add comments
-- ============================================
COMMENT ON TABLE public.factories IS 'Factory entities that own production lines';
COMMENT ON COLUMN public.factories.code IS 'Unique factory code';
COMMENT ON COLUMN public.factories.name IS 'Factory display name';
COMMENT ON COLUMN public.factories.description IS 'Optional description';
COMMENT ON COLUMN public.production_lines.factory_id IS 'Reference to factories table - the factory this production line belongs to';

-- ============================================
-- Step 6: Refresh MV
-- ============================================
REFRESH MATERIALIZED VIEW mv_component_metadata;
