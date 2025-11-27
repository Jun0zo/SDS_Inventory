/**
 * Migration: Add Material Compatibility Support
 *
 * Purpose: Enable grouping of compatible materials (same specification, different item codes)
 *
 * Changes:
 * - Add material_group_id to group compatible materials together
 * - Add is_primary to identify the primary material in a group
 * - Add priority_in_group to define usage priority within a group
 *
 * Compatible materials:
 * - Materials with the same material_group_id are interchangeable (1:1 ratio)
 * - Primary material (is_primary = true) is used first
 * - Priority determines usage order when primary is depleted
 */

-- Add columns to production_line_materials table
ALTER TABLE production_line_materials
ADD COLUMN IF NOT EXISTS material_group_id UUID,
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS priority_in_group INTEGER DEFAULT 0;

-- Add index for efficient group queries
CREATE INDEX IF NOT EXISTS idx_material_group
ON production_line_materials(material_group_id)
WHERE material_group_id IS NOT NULL;

-- Add index for priority sorting within groups
CREATE INDEX IF NOT EXISTS idx_group_priority
ON production_line_materials(production_line_id, material_group_id, priority_in_group)
WHERE material_group_id IS NOT NULL;

-- Add comment to explain the schema
COMMENT ON COLUMN production_line_materials.material_group_id IS
'UUID linking compatible materials together. Materials with same group_id are 1:1 interchangeable.';

COMMENT ON COLUMN production_line_materials.is_primary IS
'Indicates if this is the primary material in the compatibility group. Primary material is used first.';

COMMENT ON COLUMN production_line_materials.priority_in_group IS
'Priority order within compatibility group. Lower numbers = higher priority. Used when primary is depleted.';

-- Function to generate a new material group ID
CREATE OR REPLACE FUNCTION generate_material_group()
RETURNS UUID
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN uuid_generate_v4();
END;
$$;

COMMENT ON FUNCTION generate_material_group() IS
'Helper function to generate a new UUID for material compatibility groups.';

-- View to easily see material groups
CREATE OR REPLACE VIEW material_compatibility_groups AS
SELECT
  plm.production_line_id,
  pl.line_name,
  plm.material_group_id,
  COUNT(*) as materials_in_group,
  ARRAY_AGG(
    plm.material_code
    ORDER BY
      CASE WHEN plm.is_primary THEN 0 ELSE 1 END,
      plm.priority_in_group
  ) as material_codes,
  MAX(CASE WHEN plm.is_primary THEN plm.material_code END) as primary_material
FROM production_line_materials plm
JOIN production_lines pl ON pl.id = plm.production_line_id
WHERE plm.material_group_id IS NOT NULL
GROUP BY plm.production_line_id, pl.line_name, plm.material_group_id
HAVING COUNT(*) > 1  -- Only show groups with multiple materials
ORDER BY pl.line_name, materials_in_group DESC;

COMMENT ON VIEW material_compatibility_groups IS
'View showing all material compatibility groups with their members and priorities.';
