-- Function to get unassigned locations
-- These are locations in wms_raw_rows that don't exist in items table

CREATE OR REPLACE FUNCTION get_unassigned_locations(
  p_warehouse_id UUID,
  p_warehouse_code TEXT,
  p_zone TEXT
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
  SELECT
    w.cell_no,
    w.zone_cd as zone,
    COUNT(*)::BIGINT as item_count,
    COUNT(DISTINCT w.item_code)::BIGINT as unique_items,
    ARRAY_AGG(DISTINCT w.item_code ORDER BY w.item_code)::TEXT[] as sample_items
  FROM wms_raw_rows w
  WHERE w.warehouse_code = p_warehouse_code
    AND normalize_zone_code(w.split_key) = normalize_zone_code(p_zone)
    AND NOT EXISTS (
      SELECT 1
      FROM items i
      WHERE i.warehouse_id = p_warehouse_id
        AND normalize_zone_code(i.zone) = normalize_zone_code(p_zone)
        AND (
          -- Flat exact match
          UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i.location))
          OR
          -- Rack pattern match: rack "A35" matches "A35-01-01", "A35-02-03", etc.
          UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$')
        )
    )
  GROUP BY w.cell_no, w.zone_cd
  ORDER BY w.cell_no;
END;
$$;
