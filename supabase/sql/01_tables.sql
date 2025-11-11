-- Create tables for warehouse inventory management system
-- Run this file first in your Supabase SQL Editor

-- Users table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Zones table (warehouse zones like F03, F04, etc.)
CREATE TABLE IF NOT EXISTS public.zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- e.g., 'F03'
  name TEXT, -- e.g., 'Floor 3'
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Layouts table (grid configuration per zone)
CREATE TABLE IF NOT EXISTS public.layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES public.zones(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  grid JSONB NOT NULL, -- { cellPx, cols, rows, snap, showGrid }
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Items table (racks and flat storage)
CREATE TABLE IF NOT EXISTS public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id UUID REFERENCES public.layouts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('rack', 'flat')),
  zone TEXT NOT NULL,
  location TEXT NOT NULL,
  x INT NOT NULL,
  y INT NOT NULL,
  rotation INT, -- 0, 90, 180, or 270 for racks
  -- Rack specific fields
  floors INT,
  rows INT NOT NULL,
  cols INT NOT NULL,
  w INT NOT NULL,
  h INT NOT NULL,
  numbering TEXT, -- 'row-major' or 'col-major'
  order_dir TEXT, -- 'asc' or 'desc'
  per_floor_locations BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity log table
CREATE TABLE IF NOT EXISTS public.activity_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'ADD', 'UPDATE', 'DELETE', 'ROTATE', 'SAVE', etc.
  meta JSONB, -- Additional metadata about the action
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_layouts_zone_id ON public.layouts(zone_id);
CREATE INDEX IF NOT EXISTS idx_layouts_created_by ON public.layouts(created_by);
CREATE INDEX IF NOT EXISTS idx_items_layout_id ON public.items(layout_id);
CREATE INDEX IF NOT EXISTS idx_items_zone ON public.items(zone);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON public.activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON public.activity_log(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE public.users IS 'User profiles and authentication data';
COMMENT ON TABLE public.zones IS 'Warehouse zones (floors, areas, etc.)';
COMMENT ON TABLE public.layouts IS 'Grid configurations for each zone';
COMMENT ON TABLE public.items IS 'Inventory items (racks, flat storage, etc.)';
COMMENT ON TABLE public.activity_log IS 'Audit log of all user actions';
