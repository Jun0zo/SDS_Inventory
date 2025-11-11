-- Stock Status Distribution Materialized View
-- Purpose: Pre-calculate SAP stock status distribution for Dashboard pie chart
-- Performance: Replaces full table scan with aggregations

-- Drop existing view if exists
DROP MATERIALIZED VIEW IF EXISTS public.stock_status_distribution_mv CASCADE;

-- Create materialized view for stock status distribution
CREATE MATERIALIZED VIEW public.stock_status_distribution_mv AS
SELECT
  warehouse_code,
  SUM(COALESCE(unrestricted, 0))::NUMERIC AS unrestricted_qty,
  SUM(COALESCE(quality_inspection, 0))::NUMERIC AS quality_inspection_qty,
  SUM(COALESCE(blocked, 0))::NUMERIC AS blocked_qty,
  SUM(COALESCE(returns, 0))::NUMERIC AS returns_qty,
  (
    SUM(COALESCE(unrestricted, 0)) +
    SUM(COALESCE(quality_inspection, 0)) +
    SUM(COALESCE(blocked, 0)) +
    SUM(COALESCE(returns, 0))
  )::NUMERIC AS total_qty,
  -- Percentages
  CASE
    WHEN SUM(COALESCE(unrestricted, 0) + COALESCE(quality_inspection, 0) +
             COALESCE(blocked, 0) + COALESCE(returns, 0)) > 0 THEN
      ROUND(100.0 * SUM(COALESCE(unrestricted, 0)) /
        SUM(COALESCE(unrestricted, 0) + COALESCE(quality_inspection, 0) +
            COALESCE(blocked, 0) + COALESCE(returns, 0)), 2)
    ELSE 0
  END AS unrestricted_percentage,
  CASE
    WHEN SUM(COALESCE(unrestricted, 0) + COALESCE(quality_inspection, 0) +
             COALESCE(blocked, 0) + COALESCE(returns, 0)) > 0 THEN
      ROUND(100.0 * SUM(COALESCE(quality_inspection, 0)) /
        SUM(COALESCE(unrestricted, 0) + COALESCE(quality_inspection, 0) +
            COALESCE(blocked, 0) + COALESCE(returns, 0)), 2)
    ELSE 0
  END AS quality_inspection_percentage,
  CASE
    WHEN SUM(COALESCE(unrestricted, 0) + COALESCE(quality_inspection, 0) +
             COALESCE(blocked, 0) + COALESCE(returns, 0)) > 0 THEN
      ROUND(100.0 * SUM(COALESCE(blocked, 0)) /
        SUM(COALESCE(unrestricted, 0) + COALESCE(quality_inspection, 0) +
            COALESCE(blocked, 0) + COALESCE(returns, 0)), 2)
    ELSE 0
  END AS blocked_percentage,
  CASE
    WHEN SUM(COALESCE(unrestricted, 0) + COALESCE(quality_inspection, 0) +
             COALESCE(blocked, 0) + COALESCE(returns, 0)) > 0 THEN
      ROUND(100.0 * SUM(COALESCE(returns, 0)) /
        SUM(COALESCE(unrestricted, 0) + COALESCE(quality_inspection, 0) +
            COALESCE(blocked, 0) + COALESCE(returns, 0)), 2)
    ELSE 0
  END AS returns_percentage,
  NOW() AS last_updated
FROM public.sap_raw_rows
WHERE warehouse_code IS NOT NULL
GROUP BY warehouse_code;

-- Create index on materialized view
CREATE UNIQUE INDEX idx_stock_status_distribution_mv_warehouse
  ON public.stock_status_distribution_mv(warehouse_code);

-- Grant permissions
GRANT SELECT ON public.stock_status_distribution_mv TO authenticated, anon;

-- Comments
COMMENT ON MATERIALIZED VIEW public.stock_status_distribution_mv IS
  'Pre-calculated SAP stock status distribution (unrestricted, quality inspection, blocked, returns).
   Used for Dashboard pie chart visualization.
   Refresh this view after SAP data sync.';
