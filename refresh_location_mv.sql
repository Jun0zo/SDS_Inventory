-- Refresh location_inventory_summary_mv with updated production_lot_no logic
REFRESH MATERIALIZED VIEW CONCURRENTLY public.location_inventory_summary_mv;

SELECT
  'location_inventory_summary_mv refreshed successfully' as status,
  COUNT(*) as total_rows,
  MAX(last_updated) as last_updated
FROM public.location_inventory_summary_mv;
