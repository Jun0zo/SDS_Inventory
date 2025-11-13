-- Expiration Settings Table
-- Purpose: Store configuration for expiration grace periods and thresholds
-- This allows users to configure how many days after expiration items are still acceptable

DROP TABLE IF EXISTS public.expiration_settings CASCADE;

CREATE TABLE public.expiration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_code TEXT NOT NULL,
  grace_period_days INTEGER NOT NULL DEFAULT 0, -- Days after expiration that items are still acceptable
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  -- Ensure one setting per warehouse
  UNIQUE(warehouse_code)
);

-- Create index for quick lookup by warehouse
CREATE INDEX idx_expiration_settings_warehouse
  ON public.expiration_settings(warehouse_code);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.expiration_settings TO authenticated;
GRANT SELECT ON public.expiration_settings TO anon;

-- Enable RLS
ALTER TABLE public.expiration_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated users to read expiration settings"
  ON public.expiration_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert expiration settings"
  ON public.expiration_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update expiration settings"
  ON public.expiration_settings
  FOR UPDATE
  TO authenticated
  USING (true);

-- Insert default settings for common warehouses
INSERT INTO public.expiration_settings (warehouse_code, grace_period_days)
VALUES
  ('EA2-F', 3),
  ('EA2-C', 3)
ON CONFLICT (warehouse_code) DO NOTHING;

COMMENT ON TABLE public.expiration_settings IS
  'Configuration table for expiration grace periods per warehouse.
   Grace period defines how many days after expiration items are still considered acceptable.';

COMMENT ON COLUMN public.expiration_settings.grace_period_days IS
  'Number of days after expiration date that items are still acceptable for use/sale';
