-- Major categories table for material classification
-- This table stores user-defined major categories that can be assigned to materials

CREATE TABLE IF NOT EXISTS public.major_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL, -- Category name (e.g., 'Raw Material', 'Finished Goods')
  description TEXT, -- Optional description
  color TEXT, -- Optional color for UI display (hex code)
  display_order INT DEFAULT 0, -- Order for sorting in dropdowns
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT major_categories_name_not_empty CHECK (name <> '')
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_major_categories_name ON public.major_categories(name);
CREATE INDEX IF NOT EXISTS idx_major_categories_display_order ON public.major_categories(display_order);

-- Insert default categories
INSERT INTO public.major_categories (name, display_order, description) VALUES
  ('Raw Material', 1, 'Raw materials and components'),
  ('Semi-Finished Goods', 2, 'Work in progress items'),
  ('Finished Goods', 3, 'Completed products ready for sale'),
  ('Packaging Material', 4, 'Packaging and wrapping materials'),
  ('Spare Parts', 5, 'Replacement parts and components'),
  ('Consumables', 6, 'Consumable items and supplies'),
  ('Other', 999, 'Miscellaneous items')
ON CONFLICT (name) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE public.major_categories IS 'User-defined major categories for material classification';
COMMENT ON COLUMN public.major_categories.name IS 'Unique category name';
COMMENT ON COLUMN public.major_categories.display_order IS 'Display order in dropdowns (lower numbers appear first)';
