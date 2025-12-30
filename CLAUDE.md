# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A warehouse inventory management system with visual layout editor, real-time dashboard, and Google Sheets integration. Features a React/Vite frontend, FastAPI backend, and Supabase PostgreSQL database with 10 materialized views for performance optimization (20-200x speedup).

## Essential Commands

### Development
```bash
# Frontend (Vite dev server on port 5173)
npm run dev

# Backend (FastAPI on port 8787)
cd server && python app.py
# or
cd server && uvicorn app:app --reload --port 8787

# Run both for full-stack development
```

### Testing & Verification
```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test -- --watch

# Verify materialized views are properly configured
npm run verify-mvs
```

### Build & Deploy
```bash
# Build frontend for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint

# Deploy backend to Google Cloud Run (manual)
./deploy-cloud-run.sh

# Deploy backend via GitHub Actions (auto)
git push origin main
```

### Database Operations
```sql
-- Refresh all materialized views after data sync (run in Supabase SQL Editor)
SELECT refresh_all_materialized_views();

-- Refresh a specific materialized view
REFRESH MATERIALIZED VIEW CONCURRENTLY zone_capacities_mv;

-- Apply migrations to new Supabase project (in order)
-- 1. supabase/migration/01_schema_complete.sql (required)
-- 2. supabase/important/create_all_materialized_views.sql (required for performance)
-- 3. supabase/migration/03-10_*.sql (additional features as needed)
```

## Architecture Overview

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **State**: Zustand (not Redux)
- **Backend**: FastAPI (Python) + Uvicorn
- **Database**: Supabase (PostgreSQL 15+)
- **Drag & Drop**: @dnd-kit (not react-dnd)
- **Charts**: Recharts
- **Deployment**: Vercel (frontend) + Google Cloud Run (backend)

### Data Flow Pipeline
```
Google Sheets (WMS/SAP)
  ↓ (Google Sheets API)
FastAPI Backend (/api/sync/wms)
  ↓ (normalize, extract zone/location/item_code)
PostgreSQL Raw Tables (wms_raw_rows, sap_raw_rows)
  ↓ (user clicks "Sync All")
10 Materialized Views (pre-calculated queries)
  ↓ (Supabase REST API)
React Frontend (Zustand stores)
  ↓ (render)
Dashboard, Inventory View, Layout Editor
```

### Key Directories
- `src/` - Frontend React application
  - `components/` - UI components (auth, inventory, dashboard, warehouse, zone, materials, layout, ui)
  - `lib/supabase/` - Database queries (layouts, insights, warehouses, materialized-views)
  - `store/` - Zustand state management (useZoneStore, useWarehouseStore, useInventoryStore)
  - `pages/` - Route components (dashboard, zones-layout, inventory-view, materials, settings)
  - `types/` - TypeScript interfaces
- `server/` - FastAPI backend
  - `app.py` - Main API (health, config, sync endpoints)
  - `app_extended.py` - Extended API (sheet sources, warehouse bindings, ingest)
  - `ingest_new.py` - Current data ingestion logic (batch upsert, 3000 rows/batch)
  - `supabase_client.py` - Supabase SDK wrapper
  - `column_mapping.py` - Google Sheets header → PostgreSQL column mapping
- `supabase/` - Database migrations and schema
  - `migration/` - Sequential migrations (01-10)
  - `important/` - Critical files (current_schema_complete.sql, create_all_materialized_views.sql)
  - `sql/` - Individual table/function definitions
- `docs/` - Documentation (deployment, setup, troubleshooting guides)

### State Management Pattern (Zustand)
Stores handle both state AND side effects (API calls). Example:
```typescript
const useZoneStore = create<ZoneState>((set, get) => ({
  items: [],
  currentZone: null,
  // Actions with side effects
  saveLayout: async () => {
    const items = get().items;
    await supabase.from('items').upsert(items);
  },
  loadLayout: async (zoneId) => {
    const { data } = await supabase.from('items').select().eq('zone_id', zoneId);
    set({ items: data });
  },
}));
```

**Critical**: `useZoneStore` replaces the deprecated `useLayoutStore` for multi-warehouse zone management.

### Database Architecture

#### Core Schema
```
warehouses (multi-warehouse support)
  ↓ (1→many)
zones (warehouse zones like F03, EA2-A)
  ↓ (1→1 merged, layouts table removed)
items (racks, flat storage linked to zones)

materials (item catalog)
major_categories (item classifications)

sheet_sources (Google Sheets config)
warehouse_bindings (warehouse ↔ sheet mapping)

wms_raw_rows (50+ columns, denormalized: zone, location, item_code, split_key)
sap_raw_rows (30+ columns, denormalized: material, batch, split_key)

activity_log (audit trail)
```

#### Materialized Views (Performance Critical)
10 pre-calculated views that improve query performance 20-200x:

1. **zone_capacities_mv** - Zone utilization for dashboard heatmap
2. **dashboard_inventory_stats_mv** - KPI metrics (total items, quantities)
3. **inventory_discrepancies_mv** - SAP vs WMS differences
4. **wms_inventory_indexed_mv** - Indexed WMS data with zone normalization
5. **sap_inventory_indexed_mv** - Indexed SAP data
6. **location_inventory_summary_mv** - Per-location inventory (used by Layout Editor sidepanel)
7. **item_inventory_summary_mv** - Per-layout-item inventory (used by Rack/Flat detail view)
8. **stock_status_distribution_mv** - Stock status percentages (dashboard pie chart)
9. **expiring_items_mv** - Items expiring within 90 days
10. **slow_moving_items_mv** - Items in stock 60+ days

**Critical**: After WMS data sync, call `refresh_all_materialized_views()` to update MVs. This is NOT automatic.

#### Zone Normalization
Handles zone code variations automatically via `normalize_zone_code()` function:
- `EA2-A`, `EA2A`, `ea2-a` → all normalized to `EA2A`
- `zone_aliases` table for flexible mapping
- Location matching:
  - **Flat items**: exact match (e.g., "B1" = "B1")
  - **Rack items**: prefix pattern match (e.g., "A1-01-02" matches rack "A1")

### Grid System & Geometry
- **Cell Size**: 24px default (configurable 12-48px)
- **Grid Coordinates**: (x, y) in cells, not pixels
- **Canvas**: 80 cols × 50 rows default (1920×1200px)
- **Rotation**: 0°, 90°, 180°, 270° for racks
- **Snap-to-Grid**: Optional snapping to nearest cell
- **Geometry Functions**: `lib/geometry.ts` handles rotation, bounds, cell calculations

### Multi-Warehouse Design
- Every zone, layout, item links to `warehouse_id`
- Sheet sources link to warehouses via `warehouse_bindings`
- Dashboard queries filter by selected warehouse(s)
- Frontend uses `useWarehouseStore` for warehouse selection
- Backend API accepts `warehouse_code` parameter for data sync

## Critical Implementation Details

### Supabase Integration Patterns
- **Defensive Mode**: All queries handle "Supabase not configured" gracefully
- **Mock Fallback**: `useWarehouseStore` falls back to localStorage if Supabase unavailable
- **RLS**: Frontend uses anon key; backend uses service key for admin operations
- **API Pattern**: `lib/supabase/[feature].ts` exports typed query functions

### Data Ingestion Pipeline
When syncing WMS/SAP data from Google Sheets:
1. Backend fetches sheet via Google Sheets API
2. Maps columns using `WMS_COLUMN_MAP` or `SAP_COLUMN_MAP` (in `column_mapping.py`)
3. Extracts denormalized fields: `zone`, `location`, `item_code`, `split_key`, `lot_key`
4. Batch inserts 3000 rows at a time into `wms_raw_rows` or `sap_raw_rows`
5. Updates `materials` catalog
6. Frontend manually triggers MV refresh via "Sync All" button

**Critical**: Column mapping is defensive with fallback defaults. New columns in Google Sheets require updates to `column_mapping.py`.

### Component Organization
- **Canvas Components**: Pure rendering, no direct state mutations
- **SidePanel**: Property editor for selected items, calls Zustand actions
- **Toolbox**: Item templates (drag-to-add presets for racks/flat storage)
- **FilterToolbar**: Multi-select filters (warehouse, zone, status) using Radix UI

### Naming Conventions
- **Stores**: `use[Feature]Store` (e.g., `useZoneStore`, `useWarehouseStore`)
- **Pages**: `[feature].tsx` (e.g., `dashboard.tsx`, `zones-layout.tsx`)
- **Components**: PascalCase (e.g., `FilterToolbar.tsx`, `ItemRenderer.tsx`)
- **Functions**: camelCase (e.g., `getLayoutByWarehouseZone`, `normalizeZoneCode`)
- **Database**: snake_case (e.g., `wms_raw_rows`, `warehouse_bindings`)

## Common Development Scenarios

### Adding a New Materialized View
1. Create SQL in `supabase/sql/[number]_[name]_mv.sql`
2. Add to `create_all_materialized_views.sql`
3. Update `refresh_all_materialized_views()` function to include new MV
4. Add query function in `src/lib/supabase/insights.ts`
5. Update frontend components to use new MV data

### Adding a New Google Sheets Column
1. Update `WMS_COLUMN_MAP` or `SAP_COLUMN_MAP` in `server/column_mapping.py`
2. Add column to `wms_raw_rows` or `sap_raw_rows` table schema
3. Create migration SQL file in `supabase/migration/`
4. Update any affected materialized views
5. Update TypeScript types in `src/types/`

### Adding a New Item Type
1. Update `Item` type in `src/types/inventory.ts`
2. Add renderer in `src/components/inventory/canvas/`
3. Add toolbox preset in `src/components/inventory/toolbox/`
4. Update validation in `src/lib/validation.ts`
5. Update sidepanel forms in `src/components/inventory/sidepanel/`

### Debugging Performance Issues
1. Check if MVs are created: `npm run verify-mvs`
2. Check if MVs have data: `SELECT COUNT(*) FROM location_inventory_summary_mv;` in Supabase SQL Editor
3. If empty, trigger refresh: Click "Sync All" button in dashboard, or run `SELECT refresh_all_materialized_views();`
4. Check for errors in Supabase logs (Dashboard → Logs)
5. For canvas performance, check if `useZoneStore.items` is too large (>500 items may cause lag)

## Environment Variables

### Frontend (.env)
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ETL_BASE_URL=https://your-backend.a.run.app  # FastAPI backend URL
```

### Backend (server/.env or Cloud Run env vars)
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key  # NOT anon key
GOOGLE_SHEETS_CREDENTIALS_JSON={"type":"service_account",...}
FRONTEND_URL=https://your-frontend.vercel.app  # For CORS
PORT=8787  # Optional, defaults to 8787
```

## Deployment Notes

### Frontend (Vercel)
- Build command: `npm run build`
- Output directory: `dist`
- Node version: 18.x
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ETL_BASE_URL`

### Backend (Google Cloud Run)
- Containerized FastAPI app using `Dockerfile`
- Auto-scaling, zero cost when idle
- Temporary storage in `/server/data/` (NOT persistent, use Cloud Storage for production)
- Deploy script: `./deploy-cloud-run.sh` or GitHub Actions auto-deploy

### Database (Supabase)
- Apply migrations in order: `01_schema_complete.sql` → `create_all_materialized_views.sql` → additional migrations
- RLS policies currently permissive (all users can read/write all data)
- For production: implement organization-based or role-based access control

## Performance Optimization Checklist

- [ ] Materialized views created and indexed
- [ ] MVs refreshed after data sync
- [ ] Indexes on `warehouse_id`, `zone_id`, `item_code`, `created_at`
- [ ] Batch operations use 3000 rows/batch
- [ ] Canvas renders only visible items (consider virtualization if >500 items)
- [ ] Zustand stores minimize re-renders (avoid storing derived state)
- [ ] API calls debounced (save operations)
- [ ] Images/assets optimized and lazy-loaded

## Known Limitations & Gotchas

1. **Materialized Views**: NOT automatically refreshed. Must call `refresh_all_materialized_views()` after data sync.
2. **Zone Normalization**: Case-insensitive matching may cause ambiguity if zone codes differ only by case.
3. **Grid System**: Fixed 24px cells. Changing cell size requires recalculating all item positions.
4. **Cloud Run Storage**: Files in `/server/data/` are ephemeral. Use Cloud Storage for persistent files.
5. **RLS Policies**: Currently permissive. Tighten for production use.
6. **useLayoutStore**: Deprecated, use `useZoneStore` instead for multi-warehouse support.
7. **Mock Mode**: Frontend falls back to localStorage if Supabase unavailable, but backend APIs will fail.

## Testing Strategy

- **Unit Tests**: `vitest` for utility functions (`lib/geometry.ts`, `lib/validation.ts`)
- **Component Tests**: Test isolated components with mock Zustand stores
- **Integration Tests**: Test API endpoints with test database
- **E2E Tests**: Not currently implemented (consider Playwright)
- **Manual Testing**: Use `npm run verify-mvs` to verify materialized views

## Troubleshooting

### "Materialized view does not exist"
- Run `supabase/important/create_all_materialized_views.sql`
- Verify with `npm run verify-mvs`
- Check Supabase SQL Editor for errors

### "Function normalize_zone_code does not exist"
- Ensure `01_schema_complete.sql` was fully executed
- Check if execution stopped mid-file due to error

### Canvas items not rendering
- Check if `useZoneStore.items` is populated
- Verify `zone_id` matches current zone
- Check browser console for validation errors

### WMS data not syncing
- Verify Google Sheets credentials in backend env vars
- Check Cloud Run logs for API errors
- Ensure sheet name matches `sheet_sources` table
- Verify `warehouse_bindings` table links warehouse to sheet source

### Dashboard showing stale data
- Click "Sync All" button to refresh materialized views
- Check if MVs have recent `fetched_at` timestamps
- Run `SELECT refresh_all_materialized_views();` manually

## Additional Resources

- Database migrations: `supabase/migration/README.md`
- Deployment guides: `docs/CLOUD_RUN_DEPLOYMENT.md`, `docs/VERCEL_DEPLOYMENT.md`
- Troubleshooting: `docs/TROUBLESHOOTING.md`
- MV setup: `docs/SETUP_MVS.md`
- Google Sheets integration: `docs/GOOGLE_SHEETS_SETUP.md`
