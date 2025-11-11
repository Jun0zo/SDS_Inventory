-- Row Level Security policies for warehouse inventory management
-- Run this file after 01_tables.sql
-- NOTE: Authentication disabled for demo/development - all operations allowed anonymously

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Users table policies
-- Anyone can read users (demo policy)
CREATE POLICY "Anyone can read users" ON public.users
  FOR SELECT
  USING (true);

-- Anyone can create/update users (demo policy)
CREATE POLICY "Anyone can modify users" ON public.users
  FOR ALL
  USING (true);

-- Zones table policies
-- Anyone can read zones (demo policy)
CREATE POLICY "Anyone can read zones" ON public.zones
  FOR SELECT
  USING (true);

-- Anyone can create zones (demo policy)
CREATE POLICY "Anyone can create zones" ON public.zones
  FOR INSERT
  WITH CHECK (true);

-- Anyone can update zones (demo policy)
CREATE POLICY "Anyone can update zones" ON public.zones
  FOR UPDATE
  USING (true);

-- Anyone can delete zones (demo policy)
CREATE POLICY "Anyone can delete zones" ON public.zones
  FOR DELETE
  USING (true);

-- Layouts table policies
-- Anyone can read layouts (demo policy)
CREATE POLICY "Anyone can read layouts" ON public.layouts
  FOR SELECT
  USING (true);

-- Anyone can create layouts (demo policy)
CREATE POLICY "Anyone can create layouts" ON public.layouts
  FOR INSERT
  WITH CHECK (true);

-- Anyone can update layouts (demo policy)
CREATE POLICY "Anyone can update layouts" ON public.layouts
  FOR UPDATE
  USING (true);

-- Anyone can delete layouts (demo policy)
CREATE POLICY "Anyone can delete layouts" ON public.layouts
  FOR DELETE
  USING (true);

-- Items table policies
-- Anyone can read items (demo policy)
CREATE POLICY "Anyone can read items" ON public.items
  FOR SELECT
  USING (true);

-- Anyone can insert items (demo policy)
CREATE POLICY "Anyone can insert items" ON public.items
  FOR INSERT
  WITH CHECK (true);

-- Anyone can update items (demo policy)
CREATE POLICY "Anyone can update items" ON public.items
  FOR UPDATE
  USING (true);

-- Anyone can delete items (demo policy)
CREATE POLICY "Anyone can delete items" ON public.items
  FOR DELETE
  USING (true);

-- Activity log policies
-- Anyone can read activity logs (demo policy)
CREATE POLICY "Anyone can read activity logs" ON public.activity_log
  FOR SELECT
  USING (true);

-- Anyone can insert activity logs (demo policy)
CREATE POLICY "Anyone can log activity" ON public.activity_log
  FOR INSERT
  WITH CHECK (true);

-- Note: For production, consider:
-- 1. Adding organization/team-based access control
-- 2. Restricting read access to same organization
-- 3. Adding role-based permissions (viewer, editor, admin)
-- 4. Implementing soft deletes instead of hard deletes
