-- Helper functions and triggers for warehouse inventory management
-- Run this file after 01_tables.sql and 02_rls.sql

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Trigger to update updated_at on layouts table
DROP TRIGGER IF EXISTS trg_touch_layout ON public.layouts;
CREATE TRIGGER trg_touch_layout
  BEFORE UPDATE ON public.layouts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- Function to get layout statistics
CREATE OR REPLACE FUNCTION public.get_layout_stats(layout_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_items', COUNT(*),
    'rack_count', SUM(CASE WHEN type = 'rack' THEN 1 ELSE 0 END),
    'flat_count', SUM(CASE WHEN type = 'flat' THEN 1 ELSE 0 END),
    'total_capacity', SUM(
      CASE 
        WHEN type = 'rack' THEN floors * rows * cols
        WHEN type = 'flat' THEN rows * cols
        ELSE 0
      END
    )
  )
  INTO result
  FROM public.items
  WHERE layout_id = layout_uuid;
  
  RETURN result;
END;
$$;

-- Function to get zone statistics
CREATE OR REPLACE FUNCTION public.get_zone_stats(zone_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  latest_layout_id UUID;
BEGIN
  -- Get the latest layout for the zone
  SELECT id INTO latest_layout_id
  FROM public.layouts
  WHERE zone_id = zone_uuid
  ORDER BY version DESC
  LIMIT 1;
  
  IF latest_layout_id IS NULL THEN
    RETURN json_build_object(
      'total_items', 0,
      'rack_count', 0,
      'flat_count', 0,
      'total_capacity', 0
    );
  END IF;
  
  RETURN public.get_layout_stats(latest_layout_id);
END;
$$;

-- Function to clean up old layout versions (keep last 10)
CREATE OR REPLACE FUNCTION public.cleanup_old_layouts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- For each zone, delete layouts older than the 10 most recent
  DELETE FROM public.layouts
  WHERE id IN (
    SELECT id
    FROM (
      SELECT 
        id,
        ROW_NUMBER() OVER (PARTITION BY zone_id ORDER BY version DESC) as rn
      FROM public.layouts
    ) sub
    WHERE rn > 10
  );
END;
$$;

-- Optional: Create a scheduled job to run cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-old-layouts', '0 2 * * *', 'SELECT public.cleanup_old_layouts()');

COMMENT ON FUNCTION public.touch_updated_at() IS 'Automatically updates the updated_at timestamp';
COMMENT ON FUNCTION public.get_layout_stats(UUID) IS 'Returns statistics for a specific layout';
COMMENT ON FUNCTION public.get_zone_stats(UUID) IS 'Returns statistics for a specific zone';
COMMENT ON FUNCTION public.cleanup_old_layouts() IS 'Cleans up old layout versions, keeping only the 10 most recent per zone';
