-- Location Inventory Summary Materialized View (Item-Level)
-- Purpose: Pre-aggregate inventory by ITEM (not WMS location) for Zone Layout Editor SidePanel and Dashboard heatmap
-- Performance: Shows data at item granularity, matching inventory_view display level
-- Granularity: One row per item in items table (like item_inventory_summary_mv)
-- Key difference from item_inventory_summary_mv: Adds current_capa = COUNT(DISTINCT wms_locations)
--
-- Location Matching Logic:
--   - Zone matching: normalize_zone_code(w.split_key) = normalize_zone_code(i.zone)
--   - Flat items: exact location match on cell_no (e.g., "B1" = "B1")
--   - Rack items: pattern match on cell_no (e.g., "A35" matches "A35-01-01", "A35-02-03")

-- Drop existing view if exists
DROP MATERIALIZED VIEW IF EXISTS public.location_inventory_summary_mv CASCADE;

-- Create materialized view for item-level location inventory summaries
CREATE MATERIALIZED VIEW public.location_inventory_summary_mv AS
WITH rack_capacity_aware_count AS (
  -- Calculate capacity-aware stock count for rack items
  -- Logic: If cell capacity = 1, count as 1; if capacity >= 2, count all rows
  SELECT
    i.id AS item_id,
    w.cell_no,
    COUNT(*) AS row_count,
    -- Get capacity for this cell location
    CASE
      WHEN i.type = 'rack' THEN
        get_cell_capacity_from_jsonb(
          i.cell_capacity,
          (parse_rack_cell_location(w.cell_no)).floor_idx,
          (parse_rack_cell_location(w.cell_no)).col_idx
        )
      ELSE NULL
    END AS cell_capacity,
    -- Apply capacity-aware counting logic
    CASE
      WHEN i.type = 'rack' THEN
        CASE
          WHEN get_cell_capacity_from_jsonb(
            i.cell_capacity,
            (parse_rack_cell_location(w.cell_no)).floor_idx,
            (parse_rack_cell_location(w.cell_no)).col_idx
          ) = 1 THEN 1  -- Capacity = 1: count as 1
          ELSE COUNT(*)  -- Capacity >= 2: count all rows
        END
      ELSE COUNT(*)  -- Flat items: count all rows
    END AS capacity_aware_count
  FROM public.items i
  JOIN public.warehouses wh ON i.warehouse_id = wh.id
  JOIN public.wms_raw_rows w ON
    normalize_zone_code(w.split_key) = normalize_zone_code(i.zone)
    AND (
      (i.type = 'flat' AND UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i.location)))
      OR
      (i.type = 'rack' AND UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
    )
  WHERE wh.code IS NOT NULL
  GROUP BY i.id, i.type, i.cell_capacity, w.cell_no
),
item_lot_distribution AS (
  -- Pre-aggregate lot distribution per item to avoid nested aggregation
  SELECT
    i.id AS item_id,
    jsonb_object_agg(
      COALESCE(lot_agg.lot_key, 'No Lot'),
      lot_agg.lot_count
    ) AS lot_dist_json
  FROM public.items i
  JOIN public.warehouses wh ON i.warehouse_id = wh.id
  LEFT JOIN (
    SELECT
      wh2.code AS warehouse_code,
      i2.id AS item_id,
      w.lot_no AS lot_key,
      COUNT(*) AS lot_count,
      SUM(w.available_qty)::NUMERIC AS lot_qty
    FROM public.items i2
    JOIN public.warehouses wh2 ON i2.warehouse_id = wh2.id
    JOIN public.wms_raw_rows w ON
      -- Directly compare split_key with items.zone
      normalize_zone_code(w.split_key) = normalize_zone_code(i2.zone)
      AND (
        -- Flat items: exact location match
        (i2.type = 'flat' AND UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i2.location)))
        OR
        -- Rack items: pattern match (A35 matches A35-01-01)
        (i2.type = 'rack' AND UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i2.location)) || '-[0-9]+-[0-9]+$'))
      )
    GROUP BY wh2.code, i2.id, w.lot_no
  ) lot_agg ON
    lot_agg.warehouse_code = wh.code
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
  JOIN public.warehouses wh ON i.warehouse_id = wh.id
  LEFT JOIN (
    SELECT
      wh2.code AS warehouse_code,
      i2.id AS item_id,
      w.item_code,
      SUM(COALESCE(w.available_qty, 0))::NUMERIC AS item_total_qty
    FROM public.items i2
    JOIN public.warehouses wh2 ON i2.warehouse_id = wh2.id
    JOIN public.wms_raw_rows w ON
      -- Directly compare split_key with items.zone
      normalize_zone_code(w.split_key) = normalize_zone_code(i2.zone)
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
  i.warehouse_id,
  wh.code as warehouse_code,
  i.zone AS item_zone,
  i.location AS item_location,  -- Items table location name (e.g., "A35", "B1")
  i.type,
  i.max_capacity,
  -- Current stock count: capacity-aware counting
  -- For rack with capacity = 1: count as 1 per location
  -- For rack with capacity >= 2 or flat: count all rows
  COALESCE(
    (SELECT SUM(rcac.capacity_aware_count)
     FROM rack_capacity_aware_count rcac
     WHERE rcac.item_id = i.id),
    0
  )::INTEGER AS current_stock_count,
  -- Summary statistics (total_items = same as current_stock_count for consistency)
  COALESCE(
    (SELECT SUM(rcac.capacity_aware_count)
     FROM rack_capacity_aware_count rcac
     WHERE rcac.item_id = i.id),
    0
  )::INTEGER AS total_items,
  SUM(COALESCE(w.available_qty, 0))::NUMERIC AS total_available_qty,
  SUM(COALESCE(w.tot_qty, 0))::NUMERIC AS total_qty,
  COUNT(DISTINCT w.item_code) FILTER (WHERE w.item_code IS NOT NULL) AS unique_item_codes,
  COUNT(DISTINCT w.lot_no) FILTER (WHERE w.lot_no IS NOT NULL) AS unique_lots,
  -- Items as JSON array (ALL items for SidePanel)
  jsonb_agg(
    jsonb_build_object(
      'id', w.id,
      'item_code', w.item_code,
      'lot_key', w.lot_no,
      'available_qty', w.available_qty,
      'total_qty', w.tot_qty,
      'inb_date', w.inb_date,
      'valid_date', w.valid_date,
      'uld', w.uld_id,
      'item_name', w.item_nm,
      'cell_no', w.cell_no  -- WMS cell_no for reference
    )
    ORDER BY w.available_qty DESC NULLS LAST, w.cell_no, w.item_code, w.lot_no
  ) FILTER (WHERE w.id IS NOT NULL) AS items_json,
  -- Lot distribution (from pre-aggregated CTE)
  ld.lot_dist_json AS lot_distribution,
  -- Top materials (from pre-aggregated CTE)
  ma.top_materials_json AS top_materials,
  -- Utilization percentage (current_stock_count / max_capacity)
  CASE
    WHEN i.max_capacity > 0 THEN
      ROUND((
        COALESCE(
          (SELECT SUM(rcac.capacity_aware_count)
           FROM rack_capacity_aware_count rcac
           WHERE rcac.item_id = i.id),
          0
        )::NUMERIC / i.max_capacity
      ) * 100, 2)
    ELSE 0
  END AS utilization_percentage,
  MAX(w.fetched_at) AS last_updated
FROM public.items i
JOIN public.warehouses wh ON i.warehouse_id = wh.id
LEFT JOIN public.wms_raw_rows w ON
  -- Directly compare split_key with items.zone
  normalize_zone_code(w.split_key) = normalize_zone_code(i.zone)
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
  i.id, i.warehouse_id, wh.code, i.zone, i.location, i.type, i.max_capacity,
  ld.lot_dist_json, ma.top_materials_json;

-- Create indexes on materialized view
CREATE UNIQUE INDEX idx_location_inventory_summary_mv_item_id
  ON public.location_inventory_summary_mv(item_id);

CREATE INDEX idx_location_inventory_summary_mv_warehouse_id
  ON public.location_inventory_summary_mv(warehouse_id);

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
   Granularity: One row per item in items table.

   Key columns:
   - item_id: Primary key from items table
   - item_location: Items table location name (e.g., "A35", "B1")
   - current_stock_count: Capacity-aware count (for rack cells with capacity=1, counts as 1; otherwise counts all WMS rows)
   - max_capacity: From items table (theoretical max)
   - utilization_percentage: (current_stock_count / max_capacity) * 100

   Location matching logic:
   - Zone matching: normalize_zone_code(w.split_key) = normalize_zone_code(i.zone)
   - Flat items: exact location match on cell_no (e.g., "B1" = "B1")
   - Rack items: pattern match on cell_no (e.g., "A35" matches "A35-01-01", "A35-02-03", etc. using regex)

   Capacity-aware counting:
   - For rack cells with capacity = 1: count as 1 (regardless of ULD count)
   - For rack cells with capacity >= 2: count all WMS rows (each ULD is unique)
   - For flat items: count all WMS rows

   Note: items_json contains ALL items (not paginated) for SidePanel display.
   Refresh this view after WMS data sync or item changes.';
