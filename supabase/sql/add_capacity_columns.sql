-- Add capacity columns to items table
-- Run this migration to add support for floorCapacities and maxCapacity

-- Add floorCapacities for rack items (array of integers)
ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS floor_capacities INT[];

-- Add maxCapacity for flat items
ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS max_capacity INT;

-- Add comments
COMMENT ON COLUMN public.items.floor_capacities IS 'Max capacity for each floor in rack items (array)';
COMMENT ON COLUMN public.items.max_capacity IS 'Max capacity for flat storage items';
