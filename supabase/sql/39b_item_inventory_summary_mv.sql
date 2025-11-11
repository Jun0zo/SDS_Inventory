-- Item Inventory Summary Materialized View
-- Purpose: Pre-calculate inventory for each layout component (items table)
-- Used by: Zone Layout Editor to display current stock for each rack/flat component
-- Performance: Eliminates joins between items and wms_raw_rows on every component render
-- Location Matching Logic:
--   - Flat items: exact location match (e.g., "B1" = "B1")
--   - Rack items: strict pattern match (e.g., "A35" matches "A35-01-01", "A35-02-03" but NOT "A35-01" or "A35")

-- Drop existing view if exists
DROP MATERIALIZED VIEW IF EXISTS public.item_inventory_summary_mv CASCADE;

-- Re-create with updated location matching logic

-- Create materialized view for item-level inventory
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
        AND wb.source_bindings ? (w.source_id::text || '::' || w.split_key)
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

-- Comments
COMMENT ON MATERIALIZED VIEW public.item_inventory_summary_mv IS
  'Pre-calculated inventory for each layout component (items table).
   Used by Zone Layout Editor to show current stock on each rack/flat component.

   Calculation logic:
   - max_capacity: items.max_capacity (already calculated)
   - current_stock: COUNT of wms_raw_rows matching this item''s location
   - Zone + Location simultaneous matching:
     * Flat items: exact location match (e.g., B1 = B1)
     * Rack items: prefix pattern match (e.g., A35 matches A35-01-01)

   Note: items_json contains ALL items (not paginated) for SidePanel display.

   Refresh this view after WMS data sync or layout changes.
   Use refresh_all_materialized_views() to refresh all MVs.';
