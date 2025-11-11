-- Migration: Update location_inventory_summary_mv to item-level granularity
-- Date: 2025-11-06
-- Purpose: Change location_inventory_summary_mv from WMS location grouping to item-level grouping
--          to match inventory_view display granularity and add current_capa (unique location count)
--
-- Changes:
-- 1. Granularity: One row per item (not per WMS location)
-- 2. New column: current_capa = COUNT(DISTINCT wms_locations)
-- 3. Stricter location matching: Uses regex pattern for rack items
-- 4. Updated indexes: Add unique index on item_id
-- 5. Updated comments to reflect new structure

-- Drop existing materialized view
DROP MATERIALIZED VIEW IF EXISTS public.location_inventory_summary_mv CASCADE;

-- Recreate materialized view with new item-level structure
CREATE MATERIALIZED VIEW public.location_inventory_summary_mv AS
WITH item_lot_distribution AS (
  -- Pre-aggregate lot distribution per item to avoid nested aggregation
  SELECT
    i.id AS item_id,
    jsonb_object_agg(
      COALESCE(lot_agg.lot_key, 'No Lot'),
      lot_agg.lot_count
    ) AS lot_dist_json
  FROM public.items i
  JOIN public.layouts l ON i.layout_id = l.id
  LEFT JOIN (
    SELECT
      l2.warehouse_code,
      i2.id AS item_id,
      w.lot_key,
      COUNT(*) AS lot_count,
      SUM(w.available_qty)::NUMERIC AS lot_qty
    FROM public.items i2
    JOIN public.layouts l2 ON i2.layout_id = l2.id
    JOIN public.wms_raw_rows w ON
      w.warehouse_code = l2.warehouse_code
      AND normalize_zone_code(w.zone) = normalize_zone_code(i2.zone)
      AND (
        -- Flat items: exact location match
        (i2.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i2.location)))
        OR
        -- Rack items: pattern match (A35 matches A35-01-01)
        (i2.type = 'rack' AND UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i2.location)) || '-[0-9]+-[0-9]+$'))
      )
    GROUP BY l2.warehouse_code, i2.id, w.lot_key
  ) lot_agg ON
    lot_agg.warehouse_code = l.warehouse_code
    AND lot_agg.item_id = i.id
  WHERE l.warehouse_code IS NOT NULL
  GROUP BY i.id
),
item_material_aggregation AS (
  -- Pre-aggregate top materials per item
  SELECT
    i.id AS item_id,
    jsonb_agg(
      jsonb_build_object(
        'item_code', mat.item_code,
        'quantity', mat.item_total_qty
      )
      ORDER BY mat.item_total_qty DESC
    ) AS top_materials_json
  FROM public.items i
  JOIN public.layouts l ON i.layout_id = l.id
  LEFT JOIN (
    SELECT
      l2.warehouse_code,
      i2.id AS item_id,
      w.item_code,
      SUM(COALESCE(w.available_qty, 0))::NUMERIC AS item_total_qty
    FROM public.items i2
    JOIN public.layouts l2 ON i2.layout_id = l2.id
    JOIN public.wms_raw_rows w ON
      w.warehouse_code = l2.warehouse_code
      AND normalize_zone_code(w.zone) = normalize_zone_code(i2.zone)
      AND (
        (i2.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i2.location)))
        OR
        (i2.type = 'rack' AND UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i2.location)) || '-[0-9]+-[0-9]+$'))
      )
    WHERE w.item_code IS NOT NULL
    GROUP BY l2.warehouse_code, i2.id, w.item_code
  ) mat ON
    mat.warehouse_code = l.warehouse_code
    AND mat.item_id = i.id
  WHERE l.warehouse_code IS NOT NULL
  GROUP BY i.id
)
SELECT
  i.id AS item_id,
  i.layout_id,
  l.warehouse_code,
  i.zone AS item_zone,
  i.location AS item_location,  -- Items table location name (e.g., "A35", "B1")
  i.type,
  i.max_capacity,
  -- Current capacity: COUNT of unique WMS locations
  -- For rack "A35": counts A35-01-01, A35-01-02, A35-02-01 as 3
  -- For flat "B1": counts B1 as 1
  COUNT(DISTINCT w.location) FILTER (WHERE w.id IS NOT NULL) AS current_capa,
  -- Summary statistics
  COUNT(*) FILTER (WHERE w.id IS NOT NULL) AS total_items,
  SUM(COALESCE(w.available_qty, 0))::NUMERIC AS total_available_qty,
  SUM(COALESCE(w.tot_qty, 0))::NUMERIC AS total_qty,
  COUNT(DISTINCT w.item_code) FILTER (WHERE w.item_code IS NOT NULL) AS unique_item_codes,
  COUNT(DISTINCT w.lot_key) FILTER (WHERE w.lot_key IS NOT NULL) AS unique_lots,
  -- Items as JSON array (ALL items for SidePanel)
  jsonb_agg(
    jsonb_build_object(
      'id', w.id,
      'item_code', w.item_code,
      'lot_key', w.lot_key,
      'available_qty', w.available_qty,
      'total_qty', w.tot_qty,
      'inb_date', w.inb_date,
      'valid_date', w.valid_date,
      'uld', w.uld_id,
      'item_name', w.item_nm,
      'location', w.location  -- WMS location for reference
    )
    ORDER BY w.available_qty DESC NULLS LAST, w.location, w.item_code, w.lot_key
  ) FILTER (WHERE w.id IS NOT NULL) AS items_json,
  -- Lot distribution (from pre-aggregated CTE)
  ld.lot_dist_json AS lot_distribution,
  -- Top materials (from pre-aggregated CTE)
  ma.top_materials_json AS top_materials,
  -- Utilization percentage (current_capa / max_capacity)
  CASE
    WHEN i.max_capacity > 0 THEN
      ROUND((COUNT(DISTINCT w.location) FILTER (WHERE w.id IS NOT NULL)::NUMERIC / i.max_capacity) * 100, 2)
    ELSE 0
  END AS utilization_percentage,
  MAX(w.fetched_at) AS last_updated
FROM public.items i
JOIN public.layouts l ON i.layout_id = l.id
LEFT JOIN public.wms_raw_rows w ON
  w.warehouse_code = l.warehouse_code
  AND normalize_zone_code(w.zone) = normalize_zone_code(i.zone)
  AND (
    -- Flat items: exact location match
    (i.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)))
    OR
    -- Rack items: pattern match (e.g., A35 matches A35-01-01)
    (i.type = 'rack' AND UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
  )
LEFT JOIN item_lot_distribution ld ON ld.item_id = i.id
LEFT JOIN item_material_aggregation ma ON ma.item_id = i.id
WHERE l.warehouse_code IS NOT NULL
GROUP BY
  i.id, i.layout_id, l.warehouse_code, i.zone, i.location, i.type, i.max_capacity,
  ld.lot_dist_json, ma.top_materials_json;

-- Create indexes on materialized view
CREATE UNIQUE INDEX idx_location_inventory_summary_mv_item_id
  ON public.location_inventory_summary_mv(item_id);

CREATE INDEX idx_location_inventory_summary_mv_layout
  ON public.location_inventory_summary_mv(layout_id);

CREATE INDEX idx_location_inventory_summary_mv_warehouse
  ON public.location_inventory_summary_mv(warehouse_code);

CREATE INDEX idx_location_inventory_summary_mv_location
  ON public.location_inventory_summary_mv(warehouse_code, item_location);

CREATE INDEX idx_location_inventory_summary_mv_zone
  ON public.location_inventory_summary_mv(item_zone);

CREATE INDEX idx_location_inventory_summary_mv_type
  ON public.location_inventory_summary_mv(type);

CREATE INDEX idx_location_inventory_summary_mv_utilization
  ON public.location_inventory_summary_mv(utilization_percentage DESC);

-- Grant permissions
GRANT SELECT ON public.location_inventory_summary_mv TO authenticated, anon;

-- Add comments
COMMENT ON MATERIALIZED VIEW public.location_inventory_summary_mv IS
  'Pre-aggregated inventory summaries by ITEM (not WMS location) for Zone Layout Editor SidePanel and Dashboard heatmap.
   Granularity: One row per item in items table (matching inventory_view display level).

   Key columns:
   - item_id: Primary key from items table
   - item_location: Items table location name (e.g., "A35", "B1")
   - current_capa: COUNT of unique WMS locations (e.g., for rack "A35": counts A35-01-01, A35-01-02, A35-02-01 as 3)
   - max_capacity: From items table (theoretical max)
   - utilization_percentage: (current_capa / max_capacity) * 100

   Location matching logic:
   - Flat items: exact location match (e.g., "B1" = "B1")
   - Rack items: pattern match (e.g., "A35" matches "A35-01-01", "A35-02-03", etc. using regex)

   Key difference from item_inventory_summary_mv:
   - This view adds current_capa = COUNT(DISTINCT wms_locations)
   - item_inventory_summary_mv has current_stock = COUNT(DISTINCT wms_rows)

   Note: items_json contains ALL items (not paginated) for SidePanel display.
   Refresh this view after WMS data sync or layout changes.';

-- Refresh the materialized view to populate with data
REFRESH MATERIALIZED VIEW public.location_inventory_summary_mv;

-- Verify the migration
DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM public.location_inventory_summary_mv;
  RAISE NOTICE 'Migration completed: location_inventory_summary_mv now has % rows (one per item)', row_count;
END $$;
