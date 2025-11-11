-- Fix zone_id references in layouts table
-- Set proper zone_id for layouts where zone_id is null

-- First, ensure all zones exist for layouts
INSERT INTO public.zones (code, warehouse_id, warehouse_code, created_by)
SELECT DISTINCT
  l.zone_name,
  l.warehouse_id,
  l.warehouse_code,
  l.created_by
FROM public.layouts l
LEFT JOIN public.zones z ON z.code = l.zone_name AND z.warehouse_id = l.warehouse_id
WHERE l.zone_id IS NULL
  AND l.zone_name IS NOT NULL
  AND z.id IS NULL;

-- Update layouts to set zone_id based on zone_name and warehouse_id
UPDATE public.layouts
SET zone_id = z.id
FROM public.zones z
WHERE layouts.zone_id IS NULL
  AND layouts.zone_name = z.code
  AND layouts.warehouse_id = z.warehouse_id;

-- Update warehouse_code in zones table if null
UPDATE public.zones
SET warehouse_code = w.code
FROM public.warehouses w
WHERE zones.warehouse_id = w.id
  AND zones.warehouse_code IS NULL;

-- Verify the fix
SELECT
  'layouts_with_null_zone_id' as check_type,
  COUNT(*) as count
FROM public.layouts
WHERE zone_id IS NULL
UNION ALL
SELECT
  'zones_without_warehouse_code' as check_type,
  COUNT(*) as count
FROM public.zones
WHERE warehouse_code IS NULL;
