-- Fix Material Category Capacities MV Unique Index
-- Issue: COALESCE in unique index prevents concurrent refresh
-- Solution: Use plain columns in unique index (GROUP BY ensures actual uniqueness)

-- Drop the problematic unique index
DROP INDEX IF EXISTS public.idx_mv_material_category_capacities_pk;

-- Create new unique index on plain columns without expressions
-- Note: minor_category can be NULL, but GROUP BY in the MV ensures
-- we only have one row per (warehouse_id, zone, major_category, minor_category) combination
CREATE UNIQUE INDEX idx_mv_material_category_capacities_pk
  ON public.mv_material_category_capacities(
    warehouse_id,
    zone,
    major_category,
    minor_category
  );

-- Verify the index was created successfully
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND tablename = 'mv_material_category_capacities'
    AND indexname = 'idx_mv_material_category_capacities_pk'
  ) THEN
    RAISE NOTICE 'Unique index created successfully';
  ELSE
    RAISE EXCEPTION 'Failed to create unique index';
  END IF;
END $$;

COMMENT ON INDEX idx_mv_material_category_capacities_pk IS
  'Unique index on material category capacities MV to enable concurrent refresh.
   Uses plain columns without expressions to satisfy PostgreSQL concurrent refresh requirements.
   The GROUP BY in the MV query ensures actual uniqueness even with NULL minor_category values.';
