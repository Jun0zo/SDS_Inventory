-- Migration: Fix get_unassigned_locations function regex pattern
-- Date: 2025-12-22
-- Purpose: Fix broken location matching for single-letter rack identifiers (B, C, etc.)
--
-- Problem: The regex pattern '-[0-9]+-[0-9]+$' requires suffix to be present.
--          This means rack "B" does NOT match WMS cell_no "B" (only "B-01-01").
--          As a result, items with exact location matches are incorrectly marked as unassigned.
--
-- Solution: Make the suffix optional: '(-[0-9]+-[0-9]+)?$'
--          This pattern allows matching both:
--          - "B" = "B" (exact location match)
--          - "B-01-01" matches rack "B" (location with cell coordinates)
--
-- This migration updates the get_unassigned_locations() function that was
-- NOT included in 10_fix_rack_location_regex_pattern.sql (which only fixed MVs).

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Fixing get_unassigned_locations function';
  RAISE NOTICE '========================================';
END $$;

-- Drop and recreate the function with fixed regex pattern
CREATE OR REPLACE FUNCTION get_unassigned_locations(
  p_warehouse_id UUID,
  p_zone TEXT DEFAULT NULL
)
RETURNS TABLE (
  cell_no TEXT,
  zone TEXT,
  item_count BIGINT,
  unique_items BIGINT,
  sample_items TEXT[]
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH zone_sources AS (
    -- Get valid binding keys for this warehouse and zone (or all zones if p_zone is NULL)
    SELECT
      binding.key as binding_key
    FROM warehouse_bindings wb,
         LATERAL jsonb_each(wb.source_bindings) as binding
    WHERE wb.warehouse_id = p_warehouse_id
      AND binding.value->>'type' = 'wms'
      AND (p_zone IS NULL OR normalize_zone_code(binding.value->>'split_value') = normalize_zone_code(p_zone))
  ),
  filtered_locations AS (
    SELECT
      CASE
        -- Rack format: A35-01-01 → A35, B-01-01 → B
        WHEN w.cell_no ~ '^[A-Z0-9]+-[0-9]+-[0-9]+$' THEN
          REGEXP_REPLACE(w.cell_no, '^([A-Z0-9]+)-[0-9]+-[0-9]+$', '\1')
        -- Flat format or exact rack: B1 → B1, B → B
        ELSE
          w.cell_no
      END as location,
      w.zone_cd,
      w.item_code
    FROM wms_raw_rows w
    WHERE EXISTS (
        SELECT 1 FROM zone_sources zs
        WHERE (w.source_id::text || '::' || COALESCE(w.split_key, '')) = zs.binding_key
      )
      AND NOT EXISTS (
        SELECT 1
        FROM items i
        WHERE i.warehouse_id = p_warehouse_id
          AND (
            -- Flat exact match: "B1" = "B1"
            UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i.location))
            OR
            -- Rack pattern match with OPTIONAL suffix:
            -- rack "B" matches "B" (exact) AND "B-01-01" (with coordinates)
            -- rack "A35" matches "A35" (exact) AND "A35-01-01" (with coordinates)
            -- FIXED: Changed from '-[0-9]+-[0-9]+$' to '(-[0-9]+-[0-9]+)?$'
            UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i.location)) || '(-[0-9]+-[0-9]+)?$')
          )
      )
  )
  SELECT
    f.location as cell_no,
    f.zone_cd as zone,
    COUNT(*)::BIGINT as item_count,
    COUNT(DISTINCT f.item_code)::BIGINT as unique_items,
    ARRAY_AGG(DISTINCT f.item_code ORDER BY f.item_code)::TEXT[] as sample_items
  FROM filtered_locations f
  GROUP BY f.location, f.zone_cd
  ORDER BY f.location;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_unassigned_locations(UUID, TEXT) TO authenticated, anon;

DO $$
BEGIN
  RAISE NOTICE '✅ get_unassigned_locations function updated successfully';
END $$;

-- ==============================================
-- Verification
-- ==============================================

DO $$
DECLARE
  v_function_exists BOOLEAN;
  v_test_count INTEGER;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Verification:';
  RAISE NOTICE '========================================';

  -- Check if function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_unassigned_locations'
  ) INTO v_function_exists;

  IF v_function_exists THEN
    RAISE NOTICE '✅ Function get_unassigned_locations exists';
  ELSE
    RAISE WARNING '❌ Function get_unassigned_locations NOT found';
  END IF;

  -- Test the function (just check if it runs without error)
  BEGIN
    SELECT COUNT(*) INTO v_test_count
    FROM get_unassigned_locations(
      (SELECT id FROM warehouses LIMIT 1),
      NULL
    );
    RAISE NOTICE '✅ Function executed successfully, returned % rows', v_test_count;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '⚠️ Function test failed: %', SQLERRM;
  END;

  RAISE NOTICE '========================================';
END $$;

-- ==============================================
-- Usage Examples (for reference)
-- ==============================================

/*
-- Get all unassigned locations for a warehouse
SELECT * FROM get_unassigned_locations(
  'your-warehouse-id'::UUID,
  NULL  -- all zones
);

-- Get unassigned locations for a specific zone
SELECT * FROM get_unassigned_locations(
  'your-warehouse-id'::UUID,
  'EA2A'  -- specific zone
);

-- Debug: Check warehouse_bindings configuration
SELECT
  warehouse_id,
  jsonb_pretty(source_bindings) as bindings
FROM warehouse_bindings;

-- Debug: Check WMS data binding keys
SELECT DISTINCT
  source_id::text || '::' || COALESCE(split_key, '') as binding_key,
  zone_cd,
  COUNT(*) as row_count
FROM wms_raw_rows
GROUP BY source_id, split_key, zone_cd
ORDER BY row_count DESC;
*/
