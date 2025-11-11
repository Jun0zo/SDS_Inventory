-- Migration: Fix Zone Matching in Materialized Views
-- Date: 2025-11-06
-- Purpose: Fix broken zone matching logic in location_inventory_summary_mv and item_inventory_summary_mv
--
-- Problem: Zone matching was comparing i.zone (items table) with w.zone (wms_raw_rows),
--          but i.zone is an independent field not related to layouts.zone_name
--
-- Solution: Use warehouse_bindings.source_bindings JSONB to correctly map zones:
--          wms_raw_rows.split_key -> warehouse_bindings.source_bindings lookup ->
--          extract split_value -> compare with layouts.zone_name
--
-- Changes:
-- ✅ location_inventory_summary_mv: Fix zone matching in 3 places
-- ✅ item_inventory_summary_mv: Fix zone matching in 2 places

-- ==============================================
-- Part 1: Fix location_inventory_summary_mv
-- ==============================================

DO $$
BEGIN
  RAISE NOTICE 'Recreating location_inventory_summary_mv with fixed zone matching...';
END $$;

DROP MATERIALIZED VIEW IF EXISTS public.location_inventory_summary_mv CASCADE;

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
      -- Match zone via warehouse_bindings.source_bindings lookup
      AND EXISTS (
        SELECT 1 FROM public.warehouse_bindings wb
        WHERE wb.warehouse_id = l2.warehouse_id
        AND wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'type' = 'wms'
        AND normalize_zone_code(
          (wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value')
        ) = normalize_zone_code(l2.zone_name)
      )
      AND (
        -- Flat items: exact location match
        (i2.type = 'flat' AND UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i2.location)))
        OR
        -- Rack items: pattern match (A35 matches A35-01-01)
        (i2.type = 'rack' AND UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i2.location)) || '-[0-9]+-[0-9]+$'))
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
      -- Match zone via warehouse_bindings.source_bindings lookup
      AND EXISTS (
        SELECT 1 FROM public.warehouse_bindings wb
        WHERE wb.warehouse_id = l2.warehouse_id
        AND wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'type' = 'wms'
        AND normalize_zone_code(
          (wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value')
        ) = normalize_zone_code(l2.zone_name)
      )
      AND (
        (i2.type = 'flat' AND UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i2.location)))
        OR
        (i2.type = 'rack' AND UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i2.location)) || '-[0-9]+-[0-9]+$'))
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
  -- Utilization percentage (current_stock_count / max_capacity)
  CASE
    WHEN i.max_capacity > 0 THEN
      ROUND((
        CASE
          WHEN i.type = 'rack' THEN COUNT(DISTINCT w.cell_no) FILTER (WHERE w.id IS NOT NULL)
          ELSE COUNT(*) FILTER (WHERE w.id IS NOT NULL)
        END::NUMERIC / i.max_capacity
      ) * 100, 2)
    ELSE 0
  END AS utilization_percentage,
  MAX(w.fetched_at) AS last_updated
FROM public.items i
JOIN public.layouts l ON i.layout_id = l.id
LEFT JOIN public.wms_raw_rows w ON
  w.warehouse_code = l.warehouse_code
  -- Match zone via warehouse_bindings.source_bindings lookup
  AND EXISTS (
    SELECT 1 FROM public.warehouse_bindings wb
    WHERE wb.warehouse_id = l.warehouse_id
    AND wb.source_bindings ? (w.source_id::text || '::' || w.split_key)
    AND normalize_zone_code(
      (wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value')
    ) = normalize_zone_code(l.zone_name)
  )
  AND (
    -- Flat items: exact location match
    (i.type = 'flat' AND UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i.location)))
    OR
    -- Rack items: pattern match (e.g., A35 matches A35-01-01)
    (i.type = 'rack' AND UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
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

   Zone matching logic (FIXED):
   - Looks up wms_raw_rows.split_key in warehouse_bindings.source_bindings
   - Extracts split_value and compares with layouts.zone_name

   Key difference from item_inventory_summary_mv:
   - This view adds current_capa = COUNT(DISTINCT wms_locations)
   - item_inventory_summary_mv has current_stock = COUNT(DISTINCT wms_rows)

   Note: items_json contains ALL items (not paginated) for SidePanel display.
   Refresh this view after WMS data sync or layout changes.';

DO $$
BEGIN
  RAISE NOTICE '✅ location_inventory_summary_mv recreated successfully';
END $$;

-- ==============================================
-- Part 2: Fix item_inventory_summary_mv
-- ==============================================

DO $$
BEGIN
  RAISE NOTICE 'Recreating item_inventory_summary_mv with fixed zone matching...';
END $$;

DROP MATERIALIZED VIEW IF EXISTS public.item_inventory_summary_mv CASCADE;

CREATE MATERIALIZED VIEW public.item_inventory_summary_mv AS
WITH item_lot_distribution AS (
  -- Pre-aggregate lot distribution to avoid nested aggregation
  SELECT
    i.id AS item_id,
    jsonb_object_agg(
      COALESCE(lot_agg.lot_key, 'no_lot'),
      lot_agg.lot_qty
    ) AS lot_dist_json
  FROM public.items i
  JOIN public.layouts l ON i.layout_id = l.id
  LEFT JOIN (
    SELECT
      l2.warehouse_code,
      i2.zone,
      i2.location,
      w.lot_key,
      SUM(w.available_qty)::NUMERIC AS lot_qty
    FROM public.items i2
    JOIN public.layouts l2 ON i2.layout_id = l2.id
    JOIN public.wms_raw_rows w ON
      w.warehouse_code = l2.warehouse_code
      -- Match zone via warehouse_bindings.source_bindings lookup
      AND EXISTS (
        SELECT 1 FROM public.warehouse_bindings wb
        WHERE wb.warehouse_id = l2.warehouse_id
        AND wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'type' = 'wms'
        AND normalize_zone_code(
          (wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value')
        ) = normalize_zone_code(l2.zone_name)
      )
      AND (
        -- Flat 아이템: 정확한 location 매칭
        (i2.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i2.location)))
        OR
        -- Rack 아이템: base location + 숫자-숫자 패턴 매칭 (예: A35-01-01)
        (i2.type = 'rack' AND UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i2.location)) || '-[0-9]+-[0-9]+$'))
      )
    GROUP BY l2.warehouse_code, i2.zone, i2.location, w.lot_key
  ) lot_agg ON
    lot_agg.warehouse_code = l.warehouse_code
    AND normalize_zone_code(lot_agg.zone) = normalize_zone_code(i.zone)
    AND lot_agg.location = i.location
  WHERE l.warehouse_code IS NOT NULL
  GROUP BY i.id
)
SELECT
  i.id AS item_id,
  i.layout_id,
  l.zone_id,
  l.zone_name,
  l.warehouse_code,
  i.zone AS item_zone,
  i.location,
  i.type,
  i.max_capacity,
  i.x,
  i.y,
  i.w,
  i.h,
  i.rotation,
  i.floors,
  i.rows,
  i.cols,
  -- Current stock: COUNT of distinct wms_raw_rows
  COUNT(DISTINCT w.id) FILTER (WHERE w.id IS NOT NULL) AS current_stock,
  SUM(COALESCE(w.available_qty, 0))::NUMERIC AS total_available_qty,
  SUM(COALESCE(w.tot_qty, 0))::NUMERIC AS total_qty,
  COUNT(DISTINCT w.item_code) FILTER (WHERE w.item_code IS NOT NULL) AS unique_item_codes,
  -- Items JSON (ALL items for SidePanel)
  jsonb_agg(
    jsonb_build_object(
      'id', w.id,
      'item_code', w.item_code,
      'lot_key', w.lot_key,
      'available_qty', w.available_qty,
      'tot_qty', w.tot_qty,
      'inb_date', w.inb_date,
      'valid_date', w.valid_date,
      'uld_id', w.uld_id,
      'item_nm', w.item_nm,
      'location', w.location
    ) ORDER BY w.available_qty DESC NULLS LAST, w.location, w.item_code
  ) FILTER (WHERE w.id IS NOT NULL) AS items_json,
  -- Lot distribution (from pre-aggregated CTE)
  ld.lot_dist_json AS lot_distribution,
  -- Utilization percentage
  CASE
    WHEN i.max_capacity > 0 THEN
      ROUND((COUNT(DISTINCT w.id) FILTER (WHERE w.id IS NOT NULL)::NUMERIC / i.max_capacity) * 100, 2)
    ELSE 0
  END AS utilization_percentage,
  MAX(w.fetched_at) AS last_updated
FROM public.items i
JOIN public.layouts l ON i.layout_id = l.id
LEFT JOIN public.wms_raw_rows w ON
  w.warehouse_code = l.warehouse_code
  -- Match zone via warehouse_bindings.source_bindings lookup
  AND EXISTS (
    SELECT 1 FROM public.warehouse_bindings wb
    WHERE wb.warehouse_id = l.warehouse_id
    AND wb.source_bindings ? (w.source_id::text || '::' || w.split_key)
    AND normalize_zone_code(
      (wb.source_bindings->(w.source_id::text || '::' || w.split_key)->>'split_value')
    ) = normalize_zone_code(l.zone_name)
  )
  AND (
    -- Flat 아이템: 정확한 location 매칭
    (i.type = 'flat' AND UPPER(TRIM(w.location)) = UPPER(TRIM(i.location)))
    OR
    -- Rack 아이템: base location + 숫자-숫자 패턴 매칭 (예: A35-01-01)
    (i.type = 'rack' AND UPPER(TRIM(w.location)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$'))
  )
LEFT JOIN item_lot_distribution ld ON ld.item_id = i.id
WHERE l.warehouse_code IS NOT NULL
GROUP BY
  i.id, i.layout_id, l.zone_id, l.zone_name, l.warehouse_code,
  i.zone, i.location, i.type, i.max_capacity,
  i.x, i.y, i.w, i.h, i.rotation, i.floors, i.rows, i.cols,
  ld.lot_dist_json;

-- Create indexes on materialized view
CREATE UNIQUE INDEX idx_item_inventory_summary_mv_item_id
  ON public.item_inventory_summary_mv(item_id);

CREATE INDEX idx_item_inventory_summary_mv_layout
  ON public.item_inventory_summary_mv(layout_id);

CREATE INDEX idx_item_inventory_summary_mv_zone
  ON public.item_inventory_summary_mv(zone_id);

CREATE INDEX idx_item_inventory_summary_mv_warehouse
  ON public.item_inventory_summary_mv(warehouse_code);

CREATE INDEX idx_item_inventory_summary_mv_location
  ON public.item_inventory_summary_mv(warehouse_code, location);

CREATE INDEX idx_item_inventory_summary_mv_utilization
  ON public.item_inventory_summary_mv(utilization_percentage DESC);

-- Grant permissions
GRANT SELECT ON public.item_inventory_summary_mv TO authenticated, anon;

COMMENT ON MATERIALIZED VIEW public.item_inventory_summary_mv IS
  'Pre-calculated inventory for each layout component (items table).
   Used by Zone Layout Editor to show current stock on each rack/flat component.

   Calculation logic:
   - max_capacity: items.max_capacity (already calculated)
   - current_stock: COUNT of wms_raw_rows matching this item''s location
   - Zone + Location simultaneous matching:
     * Flat items: exact location match (e.g., B1 = B1)
     * Rack items: prefix pattern match (e.g., A35 matches A35-01-01)

   Zone matching logic (FIXED):
   - Looks up wms_raw_rows.split_key in warehouse_bindings.source_bindings
   - Extracts split_value and compares with layouts.zone_name

   Note: items_json contains ALL items (not paginated) for SidePanel display.

   Refresh this view after WMS data sync or layout changes.
   Use refresh_all_materialized_views() to refresh all MVs.';

DO $$
BEGIN
  RAISE NOTICE '✅ item_inventory_summary_mv recreated successfully';
END $$;

-- ==============================================
-- Part 3: Refresh Both MVs
-- ==============================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Refreshing both materialized views...';
  RAISE NOTICE '========================================';
END $$;

-- Refresh location_inventory_summary_mv
DO $$
BEGIN
  RAISE NOTICE 'Refreshing location_inventory_summary_mv...';
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.location_inventory_summary_mv;
  RAISE NOTICE '✅ location_inventory_summary_mv refreshed';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '⚠️  location_inventory_summary_mv refresh failed: %', SQLERRM;
END $$;

-- Refresh item_inventory_summary_mv
DO $$
BEGIN
  RAISE NOTICE 'Refreshing item_inventory_summary_mv...';
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.item_inventory_summary_mv;
  RAISE NOTICE '✅ item_inventory_summary_mv refreshed';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '⚠️  item_inventory_summary_mv refresh failed: %', SQLERRM;
END $$;

-- ==============================================
-- Part 4: Verification Queries
-- ==============================================

DO $$
DECLARE
  v_location_mv_count INTEGER;
  v_item_mv_count INTEGER;
  v_items_with_data INTEGER;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Verification Results:';
  RAISE NOTICE '========================================';

  -- Check location_inventory_summary_mv row count
  SELECT COUNT(*) INTO v_location_mv_count FROM public.location_inventory_summary_mv;
  RAISE NOTICE 'location_inventory_summary_mv rows: %', v_location_mv_count;

  -- Check item_inventory_summary_mv row count
  SELECT COUNT(*) INTO v_item_mv_count FROM public.item_inventory_summary_mv;
  RAISE NOTICE 'item_inventory_summary_mv rows: %', v_item_mv_count;

  -- Check how many items have matched WMS data (current_capa > 0)
  SELECT COUNT(*) INTO v_items_with_data
  FROM public.location_inventory_summary_mv
  WHERE current_capa > 0;
  RAISE NOTICE 'Items with WMS data matched (current_capa > 0): %', v_items_with_data;

  -- Summary
  RAISE NOTICE '========================================';
  IF v_location_mv_count > 0 AND v_item_mv_count > 0 THEN
    RAISE NOTICE '✅ Both materialized views populated successfully';
    IF v_items_with_data > 0 THEN
      RAISE NOTICE '✅ Zone matching is working (found % items with WMS data)', v_items_with_data;
    ELSE
      RAISE WARNING '⚠️  No items have WMS data matched. Check warehouse_bindings configuration.';
    END IF;
  ELSE
    RAISE WARNING '⚠️  Some materialized views are empty. Check data and warehouse_bindings.';
  END IF;
  RAISE NOTICE '========================================';
END $$;

-- Detailed verification query (run manually to inspect)
-- Uncomment to see sample data from location_inventory_summary_mv
/*
SELECT
  item_id,
  warehouse_code,
  item_location,
  item_zone,
  type,
  max_capacity,
  current_capa,
  total_items,
  total_available_qty,
  utilization_percentage
FROM public.location_inventory_summary_mv
WHERE current_capa > 0
ORDER BY current_capa DESC
LIMIT 10;
*/
