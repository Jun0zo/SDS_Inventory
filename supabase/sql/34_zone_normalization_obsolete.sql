-- Zone Normalization: Create zone aliases table and normalization functions
-- Purpose: Eliminate manual string matching for zone codes (EA2-A, EA2A, ea2-a, etc.)

-- Create normalization function (idempotent)
CREATE OR REPLACE FUNCTION normalize_zone_code(zone_code TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Normalize: trim, remove hyphens, uppercase
  -- "EA2-A" → "EA2A", "f-03" → "F03"
  RETURN UPPER(TRIM(REPLACE(COALESCE(zone_code, ''), '-', '')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION normalize_zone_code IS
  'Normalizes zone codes by trimming, removing hyphens, and converting to uppercase';

-- Create zone aliases table
CREATE TABLE IF NOT EXISTS public.zone_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES public.zones(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,  -- Original zone code variation (e.g., 'EA2-A', 'EA2A', 'ea2-a')
  source_type TEXT CHECK (source_type IN ('zone', 'wms', 'sap', 'manual')) DEFAULT 'zone',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alias, zone_id)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_zone_aliases_zone_id
  ON public.zone_aliases(zone_id);

CREATE INDEX IF NOT EXISTS idx_zone_aliases_normalized
  ON public.zone_aliases(normalize_zone_code(alias));

-- Create index on zones for normalized code lookups
CREATE INDEX IF NOT EXISTS idx_zones_code_normalized
  ON public.zones(normalize_zone_code(code));

-- Auto-populate aliases from existing zones
INSERT INTO public.zone_aliases (zone_id, alias, source_type)
SELECT
  z.id,
  z.code,
  'zone'
FROM public.zones z
ON CONFLICT (alias, zone_id) DO NOTHING;

-- Add normalized variations (if different from original)
INSERT INTO public.zone_aliases (zone_id, alias, source_type)
SELECT
  z.id,
  normalize_zone_code(z.code) as normalized,
  'zone'
FROM public.zones z
WHERE normalize_zone_code(z.code) != z.code
ON CONFLICT (alias, zone_id) DO NOTHING;

-- Create trigger function to auto-create aliases for new zones
CREATE OR REPLACE FUNCTION create_zone_aliases()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert original zone code
  INSERT INTO public.zone_aliases (zone_id, alias, source_type)
  VALUES (NEW.id, NEW.code, 'zone')
  ON CONFLICT (alias, zone_id) DO NOTHING;

  -- Insert normalized variation if different
  IF normalize_zone_code(NEW.code) != NEW.code THEN
    INSERT INTO public.zone_aliases (zone_id, alias, source_type)
    VALUES (NEW.id, normalize_zone_code(NEW.code), 'zone')
    ON CONFLICT (alias, zone_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to zones table
DROP TRIGGER IF EXISTS trigger_create_zone_aliases ON public.zones;
CREATE TRIGGER trigger_create_zone_aliases
  AFTER INSERT ON public.zones
  FOR EACH ROW
  EXECUTE FUNCTION create_zone_aliases();

-- Grant permissions
GRANT SELECT ON public.zone_aliases TO authenticated, anon;

-- Helper function to find zone_id by any alias
CREATE OR REPLACE FUNCTION find_zone_by_alias(
  p_alias TEXT,
  p_warehouse_code TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_zone_id UUID;
BEGIN
  SELECT za.zone_id INTO v_zone_id
  FROM public.zone_aliases za
  JOIN public.zones z ON z.id = za.zone_id
  WHERE normalize_zone_code(za.alias) = normalize_zone_code(p_alias)
    AND (p_warehouse_code IS NULL OR z.warehouse_code = p_warehouse_code)
  LIMIT 1;

  RETURN v_zone_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON TABLE public.zone_aliases IS
  'Maps zone code variations (EA2A, EA2-A, ea2-a) to canonical zones';
COMMENT ON FUNCTION find_zone_by_alias IS
  'Finds zone_id by any alias variation with optional warehouse filter';
