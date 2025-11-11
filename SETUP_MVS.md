# Materialized Views Setup Guide

## 🎯 Quick Start

You encountered a **404 error** because the materialized views haven't been created yet in your Supabase database. Follow these steps to fix it.

## ✅ Step-by-Step Instructions

### 1. Open Supabase Dashboard

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project: `jkptpedcpxssgfppzwor`
3. Navigate to **SQL Editor** in the left sidebar

### 2. Execute the Master Migration

1. Open the file: [`supabase/sql/00_execute_all_mvs.sql`](supabase/sql/00_execute_all_mvs.sql)
2. **Copy the ENTIRE file contents** (it's long, ~700 lines)
3. Paste into Supabase SQL Editor
4. Click **Run** button (or press Ctrl/Cmd + Enter)

**Expected result:** Query should complete successfully in 2-10 seconds

**What this creates:**
- `normalize_zone_code()` function - Handles zone code variations
- `zone_aliases` table - Maps zone code variations to actual zones
- 10 materialized views - Pre-calculated query results
- `refresh_all_materialized_views()` function - Syncs all MVs
- `get_rack_inventory_summary()` function - Location inventory lookup

### 3. Verify Installation

**Option A: SQL Verification** (Recommended)

1. In Supabase SQL Editor, open: [`supabase/sql/verify_mvs.sql`](supabase/sql/verify_mvs.sql)
2. Copy and paste into SQL Editor
3. Click **Run**

**Expected results:**
```
✓ 10 materialized views exist
✓ Each MV has SELECT permissions for authenticated and anon
✓ 4 functions exist (normalize_zone_code, refresh_all_materialized_views, etc.)
✓ Each MV has data (row_count > 0)
```

**Option B: Client-side Verification**

From your project directory:
```bash
npm run verify-mvs
```

**Expected output:**
```
✅ Successful: 10 / 9
🎉 All materialized views are accessible and working!
```

### 4. Test the Application

1. Refresh your browser
2. Navigate to Dashboard
3. The 404 error should be gone
4. Dashboard should load much faster (10-100x improvement)

## 🔍 Troubleshooting

### If SQL execution fails:

**Error: "function normalize_zone_code does not exist"**
- Cause: Zone normalization section wasn't executed
- Fix: Make sure you copied the ENTIRE `00_execute_all_mvs.sql` file

**Error: "relation zone_aliases does not exist"**
- Cause: Same as above
- Fix: Execute the entire file, not just parts of it

**Error: "permission denied"**
- Cause: Not running as postgres user
- Fix: You should be postgres user by default in Supabase SQL Editor

### If verification shows missing MVs:

1. Check which MVs are missing:
```sql
SELECT matviewname
FROM pg_matviews
WHERE schemaname = 'public' AND matviewname LIKE '%_mv';
```

2. If missing, re-execute `00_execute_all_mvs.sql`

### If 404 error persists after successful creation:

**Cause:** Supabase REST API hasn't recognized the new MVs yet

**Fix:** Restart Supabase API
1. Go to Supabase Dashboard → **Settings** → **API**
2. Click **"Restart API"** button
3. Wait 30 seconds
4. Try accessing the app again

### If MVs exist but have no data:

**Cause:** Source tables (wms_raw_rows, sap_raw_rows) are empty

**Fix:**
1. Import WMS/SAP data first
2. Click **"Sync All"** button in the application
3. Or manually refresh: `SELECT refresh_all_materialized_views();`

## 📊 What Each MV Does

| Materialized View | Purpose | Used By |
|------------------|---------|---------|
| `zone_capacities_mv` | Zone utilization, capacity, current stock | Dashboard Zone Heatmap |
| `dashboard_inventory_stats_mv` | Total items, quantities, unique SKUs | Dashboard KPI cards |
| `inventory_discrepancies_mv` | SAP vs WMS differences | Dashboard Discrepancies |
| `wms_inventory_indexed_mv` | Indexed WMS data with normalized zones | Internal queries |
| `sap_inventory_indexed_mv` | Indexed SAP data | Internal queries |
| `location_inventory_summary_mv` | Inventory by location (A35, A34, etc.) | Zone Layout Editor (locations) |
| `item_inventory_summary_mv` | Inventory for each layout component (rack/flat) | Zone Layout Editor (components) |
| `stock_status_distribution_mv` | Stock status percentages | Dashboard pie chart |
| `expiring_items_mv` | Items expiring within 90 days | Dashboard alerts |
| `slow_moving_items_mv` | Items in stock 60+ days | Dashboard alerts |

## 🔄 Refreshing Data

### Automatic Refresh (Recommended)

Click **"Sync All"** button in the application. This:
1. Fetches latest WMS/SAP data from Google Sheets
2. Updates `wms_raw_rows` and `sap_raw_rows` tables
3. Automatically refreshes all 10 materialized views
4. Takes 10-60 seconds depending on data size

### Manual Refresh (SQL)

```sql
-- Refresh all MVs (takes 5-30 seconds)
SELECT refresh_all_materialized_views();

-- Returns JSON with status for each MV:
{
  "total_views": 9,
  "successful": 9,
  "failed": 0,
  "duration_seconds": 12.5,
  "details": [...]
}

-- Refresh a specific MV
REFRESH MATERIALIZED VIEW CONCURRENTLY location_inventory_summary_mv;
```

### When to Refresh

Refresh MVs after:
- Importing new WMS/SAP data
- Updating zone layouts
- Modifying zone aliases
- Any changes to source tables

**Note:** The `CONCURRENTLY` option allows queries to continue while refreshing, preventing downtime.

## 🚀 Performance Improvements

After setup, you should see:

| Feature | Before | After | Speedup |
|---------|--------|-------|---------|
| Dashboard load | 5-10s | 100ms | **50-100x** |
| Zone Heatmap | 5-10s | 100ms | **50-100x** |
| Location lookup (Zone Editor) | 500ms-2s | 10ms | **50-200x** |
| KPI calculations | 2-5s | 50ms | **40-100x** |
| Discrepancy analysis | 10-30s | 200ms | **50-150x** |

## ✨ Done!

Once you complete these steps:
- ✅ 404 errors will be resolved
- ✅ Dashboard will load instantly
- ✅ Zone Layout Editor will be much faster
- ✅ All pre-calculated metrics will be available

## 📚 Additional Resources

- [README.md](README.md) - Full project documentation
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Detailed troubleshooting guide
- Individual SQL files in `supabase/sql/` (34-42) - If you need to execute specific MVs only

## 🆘 Still Having Issues?

If you're still experiencing problems after following this guide:

1. Check the browser console for errors
2. Run `npm run verify-mvs` for detailed diagnostics
3. Review [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
4. Check Supabase project logs in Dashboard → Logs → API

Good luck! 🎉
