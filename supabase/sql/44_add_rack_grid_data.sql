-- Add columns to store rack grid configuration data
-- This migration adds cellAvailability, cellCapacity, pillarAvailability, and floorCapacities to items table

ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS floor_capacities JSONB,
ADD COLUMN IF NOT EXISTS cell_availability JSONB,
ADD COLUMN IF NOT EXISTS cell_capacity JSONB,
ADD COLUMN IF NOT EXISTS pillar_availability JSONB;

-- Add comments for documentation
COMMENT ON COLUMN public.items.floor_capacities IS '[floor] - Array of max capacity per floor';
COMMENT ON COLUMN public.items.cell_availability IS '[floor][row][col] - Boolean array: true = available, false = blocked';
COMMENT ON COLUMN public.items.cell_capacity IS '[floor][row][col] - Number array: capacity per cell (0-4)';
COMMENT ON COLUMN public.items.pillar_availability IS '[pillar] - Boolean array: cols+1 pillars shared across all floors';
