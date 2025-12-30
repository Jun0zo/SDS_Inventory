-- Function to get unassigned locations
-- These are locations in wms_raw_rows that don't exist in items table
-- Updated: 2025-12-22 - Fixed regex pattern for single-letter rack identifiers

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
