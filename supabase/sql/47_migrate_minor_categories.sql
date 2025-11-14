-- Data Migration: Migrate existing minor categories from TEXT to minor_categories table
-- This script extracts unique minor categories from materials table and creates proper records

-- Step 1: Insert unique minor categories into minor_categories table
-- Only insert minor categories that have a valid major category reference
INSERT INTO public.minor_categories (name, major_category_id, display_order)
SELECT DISTINCT
  m.minor_category AS name,
  mc.id AS major_category_id,
  0 AS display_order
FROM public.materials m
INNER JOIN public.major_categories mc ON mc.name = m.major_category
WHERE m.minor_category IS NOT NULL
  AND m.minor_category <> ''
  AND m.major_category IS NOT NULL
  AND m.major_category <> ''
ON CONFLICT (name, major_category_id) DO NOTHING;

-- Step 2: Add new column to materials table for FK reference
ALTER TABLE public.materials
ADD COLUMN IF NOT EXISTS minor_category_id UUID REFERENCES public.minor_categories(id) ON DELETE SET NULL;

-- Step 3: Populate the new FK column by matching existing text values
UPDATE public.materials m
SET minor_category_id = minc.id
FROM public.minor_categories minc
INNER JOIN public.major_categories majc ON majc.id = minc.major_category_id
WHERE m.minor_category IS NOT NULL
  AND m.minor_category <> ''
  AND m.major_category = majc.name
  AND m.minor_category = minc.name;

-- Step 4: Create index for the new FK column
CREATE INDEX IF NOT EXISTS idx_materials_minor_category_id
  ON public.materials(minor_category_id);

-- Note: We keep the old minor_category TEXT column for now as backup
-- It can be dropped in a future migration after verifying the data migration was successful
-- DROP COLUMN minor_category; -- Uncomment after verification
