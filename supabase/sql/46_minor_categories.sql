-- Minor Categories Table
-- This table stores minor categories that belong to major categories
-- Creating a hierarchical relationship: major_categories (1) -> minor_categories (N)

CREATE TABLE IF NOT EXISTS public.minor_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  major_category_id UUID NOT NULL REFERENCES public.major_categories(id) ON DELETE CASCADE,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure name is unique within each major category
  CONSTRAINT minor_categories_name_major_unique UNIQUE (name, major_category_id),
  CONSTRAINT minor_categories_name_not_empty CHECK (name <> '')
);

-- Index for faster lookups by major category
CREATE INDEX IF NOT EXISTS idx_minor_categories_major_category_id
  ON public.minor_categories(major_category_id);

-- Index for ordering
CREATE INDEX IF NOT EXISTS idx_minor_categories_display_order
  ON public.minor_categories(major_category_id, display_order);

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.update_minor_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER minor_categories_updated_at
  BEFORE UPDATE ON public.minor_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_minor_categories_updated_at();

-- Enable RLS
ALTER TABLE public.minor_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies (matching major_categories pattern)
CREATE POLICY "Allow all access to minor_categories"
  ON public.minor_categories
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT ALL ON public.minor_categories TO authenticated;
GRANT ALL ON public.minor_categories TO service_role;
