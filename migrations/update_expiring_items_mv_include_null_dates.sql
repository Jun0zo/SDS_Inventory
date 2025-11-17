-- Migration: Update expiring_items_mv to include items with NULL valid_date
-- Date: 2025-11-14
-- Description: Allow items without valid_date to appear in expiring items list

-- Drop the existing materialized view
DROP MATERIALIZED VIEW IF EXISTS public.expiring_items_mv;

-- Recreate with updated logic to include NULL valid_dates
CREATE MATERIALIZED VIEW public.expiring_items_mv AS
SELECT
  split_key AS factory_location,
  item_code,
  cell_no AS location,
  zone_cd AS zone,
  production_lot_no AS lot_key,
  available_qty,
  tot_qty,
  valid_date,
  inb_date,
  item_nm,
  uld_id,
  -- Calculate days_remaining, return NULL if valid_date is NULL
  CASE
    WHEN valid_date IS NOT NULL THEN
      EXTRACT(
        DAY
        FROM
          valid_date::timestamp without time zone::timestamp with time zone - CURRENT_TIMESTAMP
      )::integer
    ELSE
      NULL
  END AS days_remaining,
  -- Calculate urgency, use 'no_expiry' if valid_date is NULL
  CASE
    WHEN valid_date IS NULL THEN 'no_expiry'::text
    WHEN EXTRACT(
      DAY
      FROM
        valid_date::timestamp without time zone::timestamp with time zone - CURRENT_TIMESTAMP
    ) < 0::numeric THEN 'expired'::text
    WHEN EXTRACT(
      DAY
      FROM
        valid_date::timestamp without time zone::timestamp with time zone - CURRENT_TIMESTAMP
    ) <= 7::numeric THEN 'critical'::text
    WHEN EXTRACT(
      DAY
      FROM
        valid_date::timestamp without time zone::timestamp with time zone - CURRENT_TIMESTAMP
    ) <= 14::numeric THEN 'high'::text
    WHEN EXTRACT(
      DAY
      FROM
        valid_date::timestamp without time zone::timestamp with time zone - CURRENT_TIMESTAMP
    ) <= 30::numeric THEN 'medium'::text
    ELSE 'low'::text
  END AS urgency,
  CURRENT_TIMESTAMP AS last_updated
FROM
  wms_raw_rows
WHERE
  split_key IS NOT NULL
  -- Removed: and valid_date is not null
  -- Include items with valid_date OR items without valid_date
  AND (
    valid_date IS NULL  -- Items without expiry date
    OR (
      -- Items with expiry date within range
      valid_date >= (CURRENT_DATE - '30 days'::interval)
      AND valid_date <= (CURRENT_DATE + '90 days'::interval)
    )
  )
ORDER BY
  (
    CASE
      WHEN valid_date IS NULL THEN 2  -- No expiry items sort last
      WHEN valid_date < CURRENT_DATE THEN 0  -- Expired items sort first
      ELSE 1  -- Expiring items sort second
    END
  ),
  valid_date NULLS LAST,
  available_qty DESC
LIMIT 500;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_expiring_items_mv_factory_location
  ON public.expiring_items_mv(factory_location);

CREATE INDEX IF NOT EXISTS idx_expiring_items_mv_item_code
  ON public.expiring_items_mv(item_code);

CREATE INDEX IF NOT EXISTS idx_expiring_items_mv_urgency
  ON public.expiring_items_mv(urgency);

-- Grant permissions
GRANT SELECT ON public.expiring_items_mv TO anon, authenticated;

-- Add comment
COMMENT ON MATERIALIZED VIEW public.expiring_items_mv IS
  'Materialized view of expiring items. Updated to include items without valid_date (no expiry). Refresh periodically.';
