# Apply Migration: Fix Component Metadata Trigger Timeout

## Problem
When updating `expected_major_category` on items table, an auto-refresh trigger attempts to refresh `mv_component_metadata` materialized view. This MV has a complex query that joins multiple large tables (wms_raw_rows, materials, production_lines), causing statement timeout (8 seconds default in Supabase).

## Solution
Disable auto-refresh triggers and refresh the MV manually via "Sync All" button or API call.

## How to Apply Migration

### Option 1: Supabase SQL Editor (Recommended)

1. Go to Supabase Dashboard: https://app.supabase.com/project/jkptpedcpxssgfppzwor/sql
2. Click "New Query"
3. Copy and paste the contents of `/Users/joon0zo/Project/SDS_Inventory2/supabase/migration/14_fix_component_metadata_trigger_timeout.sql`
4. Click "Run" or press Cmd+Enter
5. Verify success message in output

### Option 2: Command Line (if supabase CLI is installed)

```bash
cd /Users/joon0zo/Project/SDS_Inventory2
supabase db execute --file supabase/migration/14_fix_component_metadata_trigger_timeout.sql
```

### Option 3: Direct SQL (Quick Fix)

Run this minimal SQL in Supabase SQL Editor to immediately fix the issue:

```sql
-- Quick fix: Drop the problematic trigger
DROP TRIGGER IF EXISTS trigger_items_metadata_refresh ON items;

-- Update refresh function to use CONCURRENTLY
CREATE OR REPLACE FUNCTION refresh_component_metadata()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_component_metadata;
  RAISE NOTICE 'mv_component_metadata refreshed successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to refresh mv_component_metadata: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;
```

## After Applying Migration

### Expected Behavior Change

**Before:**
- Updating `expected_major_category` → Trigger fires → MV auto-refresh → Timeout error ❌

**After:**
- Updating `expected_major_category` → No trigger → Success ✅
- MV is refreshed only when you manually call `refresh_component_metadata()` or click "Sync All"

### Verify It Works

1. Try updating expected materials in the UI
2. Should succeed without 500 error
3. Click "Sync All" button to refresh materialized views
4. Material variance data will update after sync

### Update Frontend Code (Optional)

If you want to auto-refresh MV after updating expected materials, add this to the update function:

```typescript
// After successful update
const success = await updateComponentExpectedMaterials(itemId, expected, itemCodes);
if (success) {
  // Optionally trigger MV refresh
  await supabase.rpc('refresh_component_metadata');
}
```

**Note:** This refresh may still timeout for large datasets. Best practice is to refresh MVs in batch via "Sync All" button.

## Rollback (if needed)

If you need to re-enable auto-refresh triggers (not recommended):

```sql
-- Re-enable trigger
CREATE TRIGGER trigger_items_metadata_refresh
  AFTER UPDATE OF expected_major_category, expected_minor_category, feeds_production_line_ids ON items
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_component_metadata();
```

## Related Files

- Migration file: `supabase/migration/14_fix_component_metadata_trigger_timeout.sql`
- Original migration: `supabase/migration/09_add_component_metadata.sql`
- Similar fix applied: `supabase/sql/50_fix_material_triggers.sql` (for mv_material_category_capacities)
