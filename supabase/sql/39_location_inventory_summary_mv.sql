-- Location Inventory Summary Materialized View (Item-Level)
-- Purpose: Pre-aggregate inventory by ITEM (not WMS location) for Zone Layout Editor SidePanel and Dashboard heatmap
-- Performance: Shows data at item granularity, matching inventory_view display level
-- Granularity: One row per item in items table (like item_inventory_summary_mv)
-- Key difference from item_inventory_summary_mv: Adds current_capa = COUNT(DISTINCT wms_locations)
--
-- Location Matching Logic:
--   - Zone matching: directly compare split_key with items.location (bypassing zone_name)
--   - Flat items: exact location match (e.g., "B1" = "B1")
--     * current_capa = number of unique WMS locations matching "B1"
--   - Rack items: pattern match (e.g., "A35" matches "A35-01-01", "A35-02-03")
--     * current_capa = number of unique WMS locations matching "A35-##-##" pattern

-- Drop existing view if exists
DROP MATERIALIZED VIEW IF EXISTS public.location_inventory_summary_mv CASCADE;

-- Create materialized view for item-level location inventory summaries
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
  JOIN public.warehouses wh ON l.warehouse_id = wh.id
  LEFT JOIN (
    SELECT
      l2.warehouse_code,
      i2.id AS item_id,
      w.lot_key,
      COUNT(*) AS lot_count,
      SUM(w.available_qty)::NUMERIC AS lot_qty
    FROM public.items i2
    JOIN public.layouts l2 ON i2.layout_id = l2.id
    JOIN public.warehouses wh2 ON l2.warehouse_id = wh2.id
    JOIN public.wms_raw_rows w ON
      w.warehouse_code = wh2.code
      -- Directly compare split_key with items.location
      AND normalize_zone_code(w.split_key) = normalize_zone_code(i2.location)
      AND (
        -- Flat items: exact location match
        (i2.type = 'flat' AND UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i2.location)))
        OR
        -- Rack items: pattern match (A35 matches A35-01-01)
        (i2.type = 'rack' AND UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i2.location)) || '-[0-9]+-[0-9]+$'))
      )
    GROUP BY wh2.code, i2.id, w.lot_key
  ) lot_agg ON
    lot_agg.warehouse_code = l.warehouse_code
    AND lot_agg.item_id = i.id
  WHERE wh.code IS NOT NULL
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
  JOIN public.warehouses wh ON l.warehouse_id = wh.id
  LEFT JOIN (
    SELECT
      l2.warehouse_code,
      i2.id AS item_id,
      w.item_code,
      SUM(COALESCE(w.available_qty, 0))::NUMERIC AS item_total_qty
    FROM public.items i2
    JOIN public.layouts l2 ON i2.layout_id = l2.id
    JOIN public.warehouses wh2 ON l2.warehouse_id = wh2.id
    JOIN public.wms_raw_rows w ON
      w.warehouse_code = wh2.code
      -- Directly compare split_key with items.location
      AND normalize_zone_code(w.split_key) = normalize_zone_code(i2.location)
      AND (
        (i2.type = 'flat' AND UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i2.location)))
        OR
        (i2.type = 'rack' AND UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i2.location)) || '-[0-9]+-[0-9]+$'))
      )
    WHERE w.item_code IS NOT NULL
    GROUP BY wh2.code, i2.id, w.item_code
  ) mat ON
    mat.warehouse_code = wh.code
    AND mat.item_id = i.id
  WHERE wh.code IS NOT NULL
  GROUP BY i.id
)
SELECT
  i.id AS item_id,
  i.layout_id,
  wh.code as warehouse_code,
  i.zone AS item_zone,
  i.location AS item_location,  -- Items table location name (e.g., "A35", "B1")
  i.type,
  i.max_capacity,
  -- Current stock count: COUNT based on item type
  -- For rack: COUNT of unique WMS cell_no (locations)
  -- For flat: COUNT of WMS rows (items can share locations)
  CASE
    WHEN i.type = 'rack' THEN COUNT(DISTINCT w.cell_no) FILTER (WHERE w.id IS NOT NULL)
    ELSE COUNT(*) FILTER (WHERE w.id IS NOT NULL)
  END AS current_stock_count,
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
      'cell_no', w.cell_no  -- WMS cell_no for reference
    )
    ORDER BY w.available_qty DESC NULLS LAST, w.cell_no, w.item_code, w.lot_key
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
JOIN public.warehouses wh ON l.warehouse_id = wh.id
LEFT JOIN public.wms_raw_rows w ON
  -- w.warehouse_code = l.warehouse_code  -- Warehouse code filtering removed for debugging
  -- Directly compare split_key with items.location
  normalize_zone_code(w.split_key) = normalize_zone_code(i.location)
  AND (
    -- Flat items: exact location match
    (i.type = 'flat' AND UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i.location)))
    OR
    -- Rack items: pattern match (e.g., A35 matches A35-01-01)
    (i.type = 'rack' AND UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
  )
LEFT JOIN item_lot_distribution ld ON ld.item_id = i.id
LEFT JOIN item_material_aggregation ma ON ma.item_id = i.id
WHERE wh.code IS NOT NULL
GROUP BY
  i.id, i.layout_id, wh.code, i.zone, i.location, i.type, i.max_capacity,
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

-- Debug queries (run these to check why MV is empty):

-- 0. Quick data count check
-- SELECT
--   (SELECT COUNT(*) FROM wms_raw_rows) as wms_count,
--   (SELECT COUNT(*) FROM items) as items_count,
--   (SELECT COUNT(*) FROM layouts) as layouts_count,
--   (SELECT COUNT(*) FROM location_inventory_summary_mv) as mv_count;

-- 1. Check warehouse codes match
-- SELECT DISTINCT w.warehouse_code as wms_wh, l.warehouse_code as layout_wh
-- FROM wms_raw_rows w
-- CROSS JOIN (SELECT DISTINCT warehouse_code FROM layouts) l
-- ORDER BY w.warehouse_code, l.warehouse_code;

-- 2. Check split_key vs items.location normalization
-- SELECT DISTINCT
--   w.split_key as wms_split_key,
--   normalize_zone_code(w.split_key) as split_key_norm,
--   i.location as item_location,
--   normalize_zone_code(i.location) as item_location_norm
-- FROM wms_raw_rows w
-- CROSS JOIN items i
-- JOIN layouts l ON l.id = i.layout_id
-- WHERE w.warehouse_code = l.warehouse_code
-- LIMIT 20;

-- 3. Test location matching step by step
-- SELECT w.location, w.split_key, w.warehouse_code, i.location, i.type, l.warehouse_code,
--        normalize_zone_code(w.split_key) as split_key_norm,
--        normalize_zone_code(i.location) as item_location_norm,
--        CASE WHEN i.type = 'flat' AND i.location = w.location THEN 'FLAT_MATCH'
--             WHEN i.type = 'rack' AND w.location = i.location THEN 'RACK_EXACT_MATCH'
--             WHEN i.type = 'rack' AND w.location LIKE i.location || '-%' THEN 'RACK_PATTERN_MATCH'
--             ELSE 'NO_MATCH' END as match_reason,
--        CASE WHEN l.warehouse_code = w.warehouse_code
--                  AND normalize_zone_code(i.location) = normalize_zone_code(w.split_key)
--                  AND (
--                    (i.type = 'flat' AND i.location = w.location)
--                    OR (i.type = 'rack' AND (w.location = i.location OR w.location LIKE i.location || '-%'))
--                  ) THEN 'SHOULD_MATCH' ELSE 'WONT_MATCH' END as final_result
-- FROM wms_raw_rows w
-- CROSS JOIN items i
-- JOIN layouts l ON l.id = i.layout_id
-- LIMIT 50;

-- 4. Test the actual EXISTS query
-- SELECT w.location, w.split_key, w.warehouse_code,
--        EXISTS (
--          SELECT 1 FROM items i2
--          JOIN layouts l2 ON l2.id = i2.layout_id
--          WHERE (
--            (i2.type = 'flat' AND i2.location = w.location)
--            OR (i2.type = 'rack' AND (w.location = i2.location OR w.location LIKE i2.location || '-%'))
--          )
--          AND l2.warehouse_code = w.warehouse_code
--          AND normalize_zone_code(i2.location) = normalize_zone_code(w.split_key)
--        ) as exists_result
-- FROM wms_raw_rows w
-- LIMIT 20;

-- Comments
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
   - Zone matching: directly compare split_key with items.location (bypassing zone_name)
   - Flat items: exact location match (e.g., "B1" = "B1")
   - Rack items: pattern match (e.g., "A35" matches "A35-01-01", "A35-02-03", etc. using regex)

   Key difference from item_inventory_summary_mv:
   - This view adds current_capa = COUNT(DISTINCT wms_locations)
   - item_inventory_summary_mv has current_stock = COUNT(DISTINCT wms_rows)

   Note: items_json contains ALL items (not paginated) for SidePanel display.
   Refresh this view after WMS data sync or layout changes.';
