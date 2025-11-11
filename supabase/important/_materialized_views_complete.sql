-- ============================================
-- MATERIALIZED VIEWS - Complete Setup & Caching
-- 모든 MV 생성, 인덱스, 리프레시 함수 포함
-- ============================================

-- ============================================
-- 1. HELPER FUNCTIONS
-- ============================================

-- Helper function to sum integer arrays (supports both INTEGER[] and JSONB)
CREATE OR REPLACE FUNCTION sum_jsonb_array(arr JSONB)
RETURNS INTEGER AS $$
DECLARE
  total INTEGER := 0;
  val INTEGER;
BEGIN
  -- Handle NULL input
  IF arr IS NULL THEN
    RETURN 0;
  END IF;

  -- Check if it's an array
  IF jsonb_typeof(arr) = 'array' THEN
    FOR i IN 0..jsonb_array_length(arr) - 1 LOOP
      val := (arr->>i)::INTEGER;
      total := total + COALESCE(val, 0);
    END LOOP;
  END IF;

  RETURN total;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION sum_jsonb_array IS
  'Sums all elements in a JSONB integer array, treating NULL values as 0';

-- Function to calculate max_capacity for items
CREATE OR REPLACE FUNCTION calculate_item_max_capacity()
RETURNS TRIGGER AS $$
BEGIN
  -- Rack 아이템: floor_capacities 배열 합산 (jsonb를 integer[]로 변환)
  IF NEW.type = 'rack' THEN
    NEW.max_capacity := array_sum_int(ARRAY(SELECT jsonb_array_elements_text(NEW.floor_capacities)::integer));
  -- Flat 아이템: 기존 max_capacity 유지 (기본값 0)
  ELSIF NEW.type = 'flat' THEN
    NEW.max_capacity := COALESCE(NEW.max_capacity, 0);
  ELSE
    NEW.max_capacity := COALESCE(NEW.max_capacity, 0);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_item_max_capacity IS
  'Calculates max_capacity for items based on type and floor_capacities';

-- ============================================
-- 2. TRIGGERS
-- ============================================

-- Create trigger on items table
DROP TRIGGER IF EXISTS trigger_calculate_item_max_capacity ON public.items;
CREATE TRIGGER trigger_calculate_item_max_capacity
  BEFORE INSERT OR UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION calculate_item_max_capacity();

-- ============================================
-- 3. DROP EXISTING MATERIALIZED VIEWS (if they exist)
-- ============================================

-- Drop existing materialized views to avoid conflicts
DROP MATERIALIZED VIEW IF EXISTS public.location_inventory_summary_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.item_inventory_summary_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.stock_status_distribution_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.expiring_items_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.slow_moving_items_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.zone_capacities_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.dashboard_inventory_stats_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.inventory_discrepancies_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.wms_inventory_indexed_mv CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.sap_inventory_indexed_mv CASCADE;

-- ============================================
-- 4. MATERIALIZED VIEWS
-- ============================================

-- 4.1 Zone Capacities MV
CREATE MATERIALIZED VIEW public.zone_capacities_mv AS
WITH zone_components AS (
  SELECT
    z.id as zone_id,
    z.code as zone_code,
    z.name as zone_name,
    z.warehouse_id,
    z.warehouse_code,
    i.id as component_id,
    i.type,
    i.location,
    i.x,
    i.y,
    i.w,
    i.h,
    i.rows,
    i.cols,
    i.floors,
    i.max_capacity,
    i.floor_capacities,
    i.numbering,
    i.order_dir,
    i.per_floor_locations
  FROM public.zones z
  LEFT JOIN public.items i ON i.zone_id = z.id
  WHERE i.id IS NOT NULL
),
zone_capacity_info AS (
  SELECT
    zone_id,
    zone_code,
    zone_name,
    warehouse_id,
    warehouse_code,
    CASE
      WHEN type = 'rack' THEN
        GREATEST(sum_jsonb_array(floor_capacities), COALESCE(max_capacity, 0))
      WHEN type = 'flat' THEN
        COALESCE(max_capacity, rows * cols)
      ELSE 0
    END as max_capacity,
    jsonb_build_object(
      'id', component_id,
      'type', type,
      'location', location,
      'x', x,
      'y', y,
      'w', w,
      'h', h,
      'rows', rows,
      'cols', cols,
      'floors', floors,
      'max_capacity', CASE
        WHEN type = 'rack' THEN
          GREATEST(sum_jsonb_array(floor_capacities), COALESCE(max_capacity, 0))
        WHEN type = 'flat' THEN COALESCE(max_capacity, rows * cols)
        ELSE 0
      END,
      'floor_capacities', floor_capacities,
      'numbering', numbering,
      'order_dir', order_dir,
      'per_floor_locations', per_floor_locations
    ) as component_info
  FROM zone_components
)
SELECT
  zone_id,
  zone_code,
  zone_name,
  warehouse_id,
  warehouse_code,
  COALESCE(SUM(max_capacity), 0) as total_max_capacity,
  jsonb_agg(component_info ORDER BY component_info->>'location') as components
FROM zone_capacity_info
GROUP BY zone_id, zone_code, zone_name, warehouse_id, warehouse_code;

COMMENT ON MATERIALIZED VIEW public.zone_capacities_mv IS
  'Zone capacity information with component details (merged layouts into zones)';

-- 4.2 Dashboard Inventory Stats MV
CREATE MATERIALIZED VIEW public.dashboard_inventory_stats_mv AS
WITH zone_stats AS (
  SELECT
    z.id as zone_id,
    z.code as zone_code,
    z.name as zone_name,
    z.warehouse_id,
    z.warehouse_code,
    COALESCE(zc.total_max_capacity, 0) as max_capacity,
    COALESCE(SUM(
      CASE
        WHEN w.zone_cd IS NOT NULL AND i.location IS NOT NULL THEN
          CASE
            WHEN w.zone_cd = i.location THEN w.available_qty
            ELSE 0
          END
        ELSE 0
      END
    ), 0) as current_stock
  FROM public.zones z
  LEFT JOIN public.zone_capacities_mv zc ON zc.zone_id = z.id
  LEFT JOIN public.items i ON i.zone_id = z.id
  LEFT JOIN public.wms_raw_rows w ON w.source_id = (
    SELECT wb.source_bindings->>'wms'
    FROM public.warehouse_bindings wb
    WHERE wb.warehouse_id = z.warehouse_id
  )::uuid
  GROUP BY z.id, z.code, z.name, z.warehouse_id, z.warehouse_code, zc.total_max_capacity
),
warehouse_stats AS (
  SELECT
    warehouse_id,
    warehouse_code,
    COUNT(DISTINCT zone_id) as total_zones,
    SUM(max_capacity) as total_capacity,
    SUM(current_stock) as total_stock,
    ROUND(
      CASE
        WHEN SUM(max_capacity) > 0 THEN (SUM(current_stock)::decimal / SUM(max_capacity)::decimal) * 100
        ELSE 0
      END,
      2
    ) as utilization_percentage
  FROM zone_stats
  GROUP BY warehouse_id, warehouse_code
)
SELECT
  ws.warehouse_id,
  ws.warehouse_code,
  ws.total_zones,
  ws.total_capacity,
  ws.total_stock,
  ws.utilization_percentage,
  jsonb_build_object(
    'zones', jsonb_agg(
      jsonb_build_object(
        'zone_id', zs.zone_id,
        'zone_code', zs.zone_code,
        'zone_name', zs.zone_name,
        'max_capacity', zs.max_capacity,
        'current_stock', zs.current_stock,
        'utilization_percentage', ROUND(
          CASE
            WHEN zs.max_capacity > 0 THEN (zs.current_stock::decimal / zs.max_capacity::decimal) * 100
            ELSE 0
          END,
          2
        )
      )
    )
  ) as zone_details
FROM warehouse_stats ws
LEFT JOIN zone_stats zs ON zs.warehouse_id = ws.warehouse_id
GROUP BY ws.warehouse_id, ws.warehouse_code, ws.total_zones, ws.total_capacity, ws.total_stock, ws.utilization_percentage;

COMMENT ON MATERIALIZED VIEW public.dashboard_inventory_stats_mv IS
  'Dashboard inventory statistics by warehouse with zone-level details';

-- 4.3 Inventory Discrepancies MV
CREATE MATERIALIZED VIEW public.inventory_discrepancies_mv AS
WITH wms_aggregated AS (
  SELECT
    split_key,
    item_code,
    COALESCE(production_lot_no, 'NO_LOT') AS lot_key,
    SUM(COALESCE(available_qty, 0))::NUMERIC AS wms_qty
  FROM public.wms_raw_rows
  WHERE split_key IS NOT NULL
    AND item_code IS NOT NULL
  GROUP BY split_key, item_code, COALESCE(production_lot_no, 'NO_LOT')
),
sap_aggregated AS (
  SELECT
    split_key,
    material AS item_code,
    COALESCE(batch, 'NO_LOT') AS lot_key,
    SUM(COALESCE(unrestricted_qty, 0))::NUMERIC AS sap_qty
  FROM public.sap_raw_rows
  WHERE split_key IS NOT NULL
    AND material IS NOT NULL
  GROUP BY split_key, material, COALESCE(batch, 'NO_LOT')
),
joined_data AS (
  SELECT
    COALESCE(w.split_key, s.split_key) AS split_key,
    COALESCE(w.item_code, s.item_code) AS item_code,
    COALESCE(w.lot_key, s.lot_key) AS lot_key,
    COALESCE(w.wms_qty, 0)::NUMERIC AS wms_qty,
    COALESCE(s.sap_qty, 0)::NUMERIC AS sap_qty,
    (COALESCE(s.sap_qty, 0) - COALESCE(w.wms_qty, 0))::NUMERIC AS discrepancy
  FROM wms_aggregated w
  FULL OUTER JOIN sap_aggregated s
    ON w.split_key = s.split_key
    AND w.item_code = s.item_code
    AND w.lot_key = s.lot_key
)
SELECT
  split_key,
  item_code,
  CASE WHEN lot_key = 'NO_LOT' THEN NULL ELSE lot_key END AS lot_key,
  wms_qty,
  sap_qty,
  discrepancy,
  ABS(discrepancy) AS abs_discrepancy,
  -- Calculate percentage difference
  CASE
    WHEN wms_qty > 0 THEN ROUND(100.0 * discrepancy / wms_qty, 2)
    WHEN sap_qty > 0 THEN 100.0
    ELSE 0
  END AS percentage_diff,
  -- Categorize discrepancy severity
  CASE
    WHEN ABS(discrepancy) = 0 THEN 'match'
    WHEN ABS(discrepancy) < 10 THEN 'minor'
    WHEN ABS(discrepancy) < 100 THEN 'moderate'
    WHEN ABS(discrepancy) < 1000 THEN 'high'
    ELSE 'critical'
  END AS severity,
  NOW() AS last_updated
FROM joined_data
WHERE ABS(discrepancy) >= 1  -- Only store actual discrepancies
ORDER BY ABS(discrepancy) DESC
LIMIT 1000;  -- Store top 1000 discrepancies

COMMENT ON MATERIALIZED VIEW public.inventory_discrepancies_mv IS
  'Pre-calculated SAP vs WMS inventory discrepancies by split_key (factory/location) and item_code (top 1000 by absolute difference).
   Groups data by split_key (factory), item_code, and lot_key to show discrepancies per factory-item combination.
   Eliminates expensive client-side joins of wms_raw_rows and sap_raw_rows tables.
   Refresh this view after WMS/SAP data sync.';

-- 4.4 WMS Inventory Indexed MV
CREATE MATERIALIZED VIEW public.wms_inventory_indexed_mv AS
SELECT
  id,
  source_id,
  item_code,
  production_lot_no as lot_key,
  location,
  available_qty,
  tot_qty,
  inb_date,
  valid_date,
  prod_date,
  batch_id,
  fetched_at,
  split_key,
  zone_cd,
  zone
FROM public.wms_raw_rows
WHERE item_code IS NOT NULL;

COMMENT ON MATERIALIZED VIEW public.wms_inventory_indexed_mv IS
  'Indexed WMS inventory data for fast queries';

-- 4.5 SAP Inventory Indexed MV
CREATE MATERIALIZED VIEW public.sap_inventory_indexed_mv AS
SELECT
  id,
  source_id,
  material as item_code,
  split_key as location,
  unrestricted_qty,
  quality_inspection_qty,
  blocked_qty,
  returns_qty,
  batch,
  fetched_at
FROM public.sap_raw_rows
WHERE material IS NOT NULL;

COMMENT ON MATERIALIZED VIEW public.sap_inventory_indexed_mv IS
  'Indexed SAP inventory data for fast queries';

-- 4.6 Location Inventory Summary MV
CREATE MATERIALIZED VIEW public.location_inventory_summary_mv AS
WITH item_lot_distribution AS (
  SELECT
    i.id as item_id,
    i.zone_id,
    i.location as item_location,
    w.item_code,
    w.production_lot_no as lot_key,
    w.available_qty,
    w.tot_qty,
    w.inb_date,
    w.valid_date,
    w.prod_date,
    w.batch_id,
    w.uld_id,
    w.split_key,
    ROW_NUMBER() OVER (
      PARTITION BY i.id, w.production_lot_no
      ORDER BY w.fetched_at DESC
    ) as rn
  FROM public.items i
  LEFT JOIN public.wms_raw_rows w ON
    -- Location matching logic for cell_no
    CASE
      WHEN i.type = 'flat' THEN UPPER(TRIM(w.cell_no)) = UPPER(TRIM(i.location))
      WHEN i.type = 'rack' THEN UPPER(TRIM(w.cell_no)) ~ ('^' || UPPER(TRIM(i.location)) || '-[0-9]+-[0-9]+$')
      ELSE false
    END
),
item_material_aggregation AS (
  SELECT
    item_id,
    zone_id,
    item_location,
    item_code,
    COUNT(*) as current_stock_count,  -- 현재 재고 개수 (매칭된 행의 개수)
    SUM(tot_qty) as total_qty,
    COUNT(DISTINCT lot_key) as lot_count,
    jsonb_agg(
      jsonb_build_object(
        'lot_key', lot_key,
        'available_qty', available_qty,
        'total_qty', tot_qty,
        'inb_date', inb_date,
        'valid_date', valid_date,
        'prod_date', prod_date,
        'batch_id', batch_id,
        'uld_id', uld_id
      )
    ) as lots_info
  FROM item_lot_distribution
  -- WHERE rn = 1
  GROUP BY item_id, zone_id, item_location, item_code
)
SELECT
  ima.item_id,
  ima.zone_id,
  ima.item_location,
  ima.item_code,
  ima.current_stock_count,
  ima.total_qty,
  ima.lot_count,
  i.max_capacity,
  i.type,
  CASE
    WHEN i.max_capacity > 0 THEN
      ROUND((ima.current_stock_count::decimal / i.max_capacity) * 100, 2)
    ELSE 0
  END as utilization_percentage,
  ima.lots_info,
  CASE
    WHEN ima.current_stock_count = 0 THEN 'EMPTY'
    WHEN ima.current_stock_count < (i.max_capacity * 0.1) THEN 'LOW_STOCK'
    WHEN ima.current_stock_count > (i.max_capacity * 0.9) THEN 'OVER_STOCK'
    ELSE 'NORMAL'
  END as stock_status
FROM item_material_aggregation ima
LEFT JOIN public.items i ON i.id = ima.item_id;

COMMENT ON MATERIALIZED VIEW public.location_inventory_summary_mv IS
  'Location-level inventory summary with lot details';

-- 4.7 Item Inventory Summary MV
CREATE MATERIALIZED VIEW public.item_inventory_summary_mv AS
WITH item_totals AS (
  SELECT
    item_code,
    COUNT(DISTINCT item_location) as location_count,
    SUM(current_stock_count) as total_available_qty,
    SUM(total_qty) as total_qty,
    SUM(lot_count) as total_lot_count,
    AVG(
      CASE
        WHEN stock_status = 'NORMAL' THEN 1
        WHEN stock_status = 'LOW_STOCK' THEN 2
        WHEN stock_status = 'OVER_STOCK' THEN 3
        WHEN stock_status = 'EMPTY' THEN 4
        ELSE 5
      END
    ) as avg_stock_status_score
  FROM public.location_inventory_summary_mv
  GROUP BY item_code
)
SELECT
  it.item_code,
  it.location_count,
  it.total_available_qty,
  it.total_qty,
  it.total_lot_count,
  CASE
    WHEN it.avg_stock_status_score < 1.5 THEN 'NORMAL'
    WHEN it.avg_stock_status_score < 2.5 THEN 'LOW_STOCK'
    WHEN it.avg_stock_status_score < 3.5 THEN 'OVER_STOCK'
    ELSE 'EMPTY'
  END as overall_stock_status,
  m.description,
  m.unit,
  mc.name as major_category
FROM item_totals it
LEFT JOIN public.materials m ON m.item_code = it.item_code
LEFT JOIN public.major_categories mc ON mc.id = (
  SELECT id FROM public.major_categories
  WHERE name = m.major_category
  LIMIT 1
);

COMMENT ON MATERIALIZED VIEW public.item_inventory_summary_mv IS
  'Item-level inventory summary across all locations';

-- 4.8 Stock Status Distribution MV
CREATE MATERIALIZED VIEW public.stock_status_distribution_mv AS
WITH status_counts AS (
  SELECT
    stock_status,
    COUNT(*) as location_count,
    SUM(current_stock_count) as total_qty
  FROM public.location_inventory_summary_mv
  GROUP BY stock_status
),
total_stats AS (
  SELECT
    SUM(location_count) as total_locations,
    SUM(total_qty) as total_inventory
  FROM status_counts
)
SELECT
  sc.stock_status,
  sc.location_count,
  sc.total_qty,
  ROUND((sc.location_count::decimal / ts.total_locations::decimal) * 100, 2) as location_percentage,
  ROUND((sc.total_qty::decimal / ts.total_inventory::decimal) * 100, 2) as inventory_percentage
FROM status_counts sc, total_stats ts
ORDER BY
  CASE sc.stock_status
    WHEN 'EMPTY' THEN 1
    WHEN 'LOW_STOCK' THEN 2
    WHEN 'NORMAL' THEN 3
    WHEN 'OVER_STOCK' THEN 4
    ELSE 5
  END;

COMMENT ON MATERIALIZED VIEW public.stock_status_distribution_mv IS
  'Stock status distribution across all inventory locations';

-- 4.9 Expiring Items MV
CREATE MATERIALIZED VIEW public.expiring_items_mv AS
SELECT
  lis.item_id,
  lis.zone_id,
  lis.item_location,
  lis.item_code,
  lis.current_stock_count,
  lis.total_qty,
  lis.stock_status,
  li->>'lot_key' as lot_key,
  (li->>'available_qty')::numeric as available_qty,
  (li->>'total_qty')::numeric as lot_total_qty,
  (li->>'valid_date')::date as valid_date,
  (li->>'prod_date')::date as prod_date,
  li->>'batch_id' as batch_id,
  CASE
    WHEN (li->>'valid_date')::date IS NOT NULL THEN
      ((li->>'valid_date')::date - CURRENT_DATE)::integer
    ELSE NULL
  END as days_to_expiry,
  CASE
    WHEN (li->>'valid_date')::date IS NOT NULL THEN
      CASE
        WHEN (li->>'valid_date')::date <= CURRENT_DATE + INTERVAL '7 days' THEN 'CRITICAL'
        WHEN (li->>'valid_date')::date <= CURRENT_DATE + INTERVAL '30 days' THEN 'WARNING'
        WHEN (li->>'valid_date')::date <= CURRENT_DATE + INTERVAL '90 days' THEN 'NOTICE'
        ELSE 'NORMAL'
      END
    ELSE 'UNKNOWN'
  END as expiry_status
FROM public.location_inventory_summary_mv lis,
LATERAL jsonb_array_elements(lis.lots_info) as li
WHERE (li->>'valid_date')::date IS NOT NULL
  AND (li->>'valid_date')::date <= CURRENT_DATE + INTERVAL '90 days'
ORDER BY (li->>'valid_date')::date ASC;

COMMENT ON MATERIALIZED VIEW public.expiring_items_mv IS
  'Items with upcoming expiry dates within 90 days';

-- 4.10 Slow Moving Items MV
CREATE MATERIALIZED VIEW public.slow_moving_items_mv AS
WITH item_movement AS (
  SELECT
    w.item_code,
    MAX(w.fetched_at) as last_movement,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MAX(w.fetched_at))) / 86400 as days_since_movement,
    COUNT(*) as movement_count,
    z.code as warehouse_code
  FROM public.wms_raw_rows w
  JOIN public.warehouse_bindings wb ON wb.source_bindings->>'wms' = w.source_id::text
  JOIN public.zones z ON z.id = wb.warehouse_id
  WHERE w.available_qty > 0
    AND w.fetched_at >= CURRENT_TIMESTAMP - INTERVAL '180 days'
  GROUP BY w.item_code, z.code
),
slow_items AS (
  SELECT
    im.item_code,
    im.days_since_movement,
    im.movement_count,
    im.warehouse_code,
    lis.location_count,
    lis.total_available_qty,
    lis.total_qty,
    CASE
      WHEN im.days_since_movement >= 90 THEN 'STAGNANT'
      WHEN im.days_since_movement >= 60 THEN 'SLOW'
      WHEN im.days_since_movement >= 30 THEN 'MODERATE'
      ELSE 'ACTIVE'
    END as movement_status
  FROM item_movement im
  LEFT JOIN public.item_inventory_summary_mv lis ON lis.item_code = im.item_code
  WHERE im.days_since_movement >= 30
)
SELECT
  si.item_code,
  si.days_since_movement,
  si.movement_count,
  si.location_count,
  si.total_available_qty,
  si.total_qty,
  si.warehouse_code,
  si.movement_status,
  m.description,
  m.unit,
  mc.name as major_category
FROM slow_items si
LEFT JOIN public.materials m ON m.item_code = si.item_code
LEFT JOIN public.major_categories mc ON mc.id = (
  SELECT id FROM public.major_categories
  WHERE name = m.major_category
  LIMIT 1
)
ORDER BY si.days_since_movement DESC;

COMMENT ON MATERIALIZED VIEW public.slow_moving_items_mv IS
  'Slow moving items based on recent activity (30+ days)';

-- ============================================
-- 5. INDEXES FOR MATERIALIZED VIEWS
-- ============================================

-- Zone Capacities MV indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_zone_capacities_mv_zone_id ON public.zone_capacities_mv(zone_id);
CREATE INDEX IF NOT EXISTS idx_zone_capacities_mv_warehouse_id ON public.zone_capacities_mv(warehouse_id);

-- Dashboard Inventory Stats MV indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_stats_mv_warehouse_id ON public.dashboard_inventory_stats_mv(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_stats_mv_warehouse_code ON public.dashboard_inventory_stats_mv(warehouse_code);

-- Inventory Discrepancies MV indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_discrepancies_unique ON public.inventory_discrepancies_mv(split_key, item_code, lot_key);
CREATE INDEX IF NOT EXISTS idx_inventory_discrepancies_split_key ON public.inventory_discrepancies_mv(split_key);
CREATE INDEX IF NOT EXISTS idx_inventory_discrepancies_abs_discrepancy ON public.inventory_discrepancies_mv(abs_discrepancy DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_discrepancies_severity ON public.inventory_discrepancies_mv(severity);
CREATE INDEX IF NOT EXISTS idx_inventory_discrepancies_item_code ON public.inventory_discrepancies_mv(item_code);

-- WMS Inventory Indexed MV indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_wms_inventory_id ON public.wms_inventory_indexed_mv(id);
CREATE INDEX IF NOT EXISTS idx_wms_inventory_item_code ON public.wms_inventory_indexed_mv(item_code);
CREATE INDEX IF NOT EXISTS idx_wms_inventory_location ON public.wms_inventory_indexed_mv(location);
CREATE INDEX IF NOT EXISTS idx_wms_inventory_split_key ON public.wms_inventory_indexed_mv(split_key);

-- SAP Inventory Indexed MV indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_sap_inventory_id ON public.sap_inventory_indexed_mv(id);
CREATE INDEX IF NOT EXISTS idx_sap_inventory_item_code ON public.sap_inventory_indexed_mv(item_code);
CREATE INDEX IF NOT EXISTS idx_sap_inventory_location ON public.sap_inventory_indexed_mv(location);

-- Location Inventory Summary MV indexes
CREATE UNIQUE INDEX IF NOT EXISTS ux_location_inventory_summary_mv ON public.location_inventory_summary_mv(item_id, item_code);
CREATE INDEX IF NOT EXISTS idx_location_inventory_zone_id ON public.location_inventory_summary_mv(zone_id);
CREATE INDEX IF NOT EXISTS idx_location_inventory_location ON public.location_inventory_summary_mv(item_location);
CREATE INDEX IF NOT EXISTS idx_location_inventory_stock_status ON public.location_inventory_summary_mv(stock_status);

-- Item Inventory Summary MV indexes
CREATE UNIQUE INDEX IF NOT EXISTS ux_item_inventory_summary_mv ON public.item_inventory_summary_mv(item_code);
CREATE INDEX IF NOT EXISTS idx_item_inventory_stock_status ON public.item_inventory_summary_mv(overall_stock_status);

-- Stock Status Distribution MV indexes
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_status_distribution_mv ON public.stock_status_distribution_mv(stock_status);

-- Expiring Items MV indexes
CREATE UNIQUE INDEX IF NOT EXISTS ux_expiring_items_mv ON public.expiring_items_mv(item_id, lot_key);
CREATE INDEX IF NOT EXISTS idx_expiring_items_valid_date ON public.expiring_items_mv(valid_date);
CREATE INDEX IF NOT EXISTS idx_expiring_items_expiry_status ON public.expiring_items_mv(expiry_status);

-- Slow Moving Items MV indexes
CREATE UNIQUE INDEX IF NOT EXISTS ux_slow_moving_items_mv ON public.slow_moving_items_mv(item_code);
CREATE INDEX IF NOT EXISTS idx_slow_moving_movement_status ON public.slow_moving_items_mv(movement_status);

-- ============================================
-- 6. REFRESH FUNCTIONS
-- ============================================

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
RETURNS TABLE(view_name TEXT, refresh_time INTERVAL) AS $$
DECLARE
  view_record RECORD;
  start_time TIMESTAMP;
  end_time TIMESTAMP;
BEGIN
  -- Create temp table to store results
  CREATE TEMP TABLE IF NOT EXISTS mv_refresh_results (
    view_name TEXT,
    refresh_time INTERVAL
  );

  -- List of all materialized views to refresh
  FOR view_record IN
    SELECT unnest(ARRAY[
      'zone_capacities_mv',
      'dashboard_inventory_stats_mv',
      'inventory_discrepancies_mv',
      'wms_inventory_indexed_mv',
      'sap_inventory_indexed_mv',
      'location_inventory_summary_mv',
      'item_inventory_summary_mv',
      'stock_status_distribution_mv',
      'expiring_items_mv',
      'slow_moving_items_mv'
    ]) as view_name
  LOOP
    start_time := clock_timestamp();

    -- Dynamically refresh each materialized view
    EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY public.%I', view_record.view_name);

    end_time := clock_timestamp();

    -- Insert result into temp table
    INSERT INTO mv_refresh_results VALUES (view_record.view_name, end_time - start_time);
  END LOOP;

  -- Return results
  RETURN QUERY SELECT * FROM mv_refresh_results;

  -- Clean up
  DROP TABLE IF EXISTS mv_refresh_results;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_all_materialized_views IS
  'Refreshes all materialized views concurrently and returns timing information';

-- Function to refresh specific materialized view
CREATE OR REPLACE FUNCTION refresh_materialized_view(view_name TEXT)
RETURNS INTERVAL AS $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
BEGIN
  start_time := clock_timestamp();

  -- Refresh the specified materialized view
  EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY public.%I', view_name);

  end_time := clock_timestamp();

  RETURN end_time - start_time;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_materialized_view IS
  'Refreshes a specific materialized view and returns the refresh time';

-- ============================================
-- 7. INITIAL REFRESH (EXECUTE ONCE)
-- ============================================

-- Refresh all materialized views initially
SELECT * FROM refresh_all_materialized_views();

-- ============================================
-- 8. USAGE EXAMPLES
-- ============================================

/*
-- 개별 MV 리프레시 예시:
SELECT refresh_materialized_view('zone_capacities_mv');

-- 전체 MV 리프레시 예시:
SELECT * FROM refresh_all_materialized_views();

-- 대시보드 쿼리 예시:
SELECT * FROM dashboard_inventory_stats_mv WHERE warehouse_id = 'your-warehouse-id';

-- 재고 불일치 확인:
SELECT * FROM inventory_discrepancies_mv WHERE priority_level = 'HIGH';

-- 유통기한 임박 아이템:
SELECT * FROM expiring_items_mv WHERE expiry_status = 'CRITICAL';

-- 재고 현황 분포:
SELECT * FROM stock_status_distribution_mv ORDER BY location_percentage DESC;
*/

-- ============================================
-- END OF MATERIALIZED VIEWS SETUP
-- ============================================
