-- Fix warehouse RLS policy to allow updates by current user
-- This is more permissive for development/demo purposes

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "w_wh_update" ON public.warehouses;

-- Create more permissive policy
-- Option 1: Allow all authenticated users to update (for demo/dev)
CREATE POLICY "w_wh_update_v2" ON public.warehouses
  FOR UPDATE
  USING (auth.role() = 'authenticated');  -- Any logged-in user can update

-- Option 2: If you want stricter control, use this instead:
-- CREATE POLICY "w_wh_update_v2" ON public.warehouses
--   FOR UPDATE
--   USING (
--     auth.uid() = created_by  -- Creator can update
--     OR 
--     auth.role() = 'service_role'  -- Service role can update
--   );

COMMENT ON POLICY "w_wh_update_v2" ON public.warehouses IS
  'Allow authenticated users to update warehouses (permissive for dev/demo)';
