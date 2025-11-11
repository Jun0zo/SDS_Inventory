# Warehouse Inventory Manager

A production-ready warehouse inventory layout manager with a modern dashboard UI and Supabase backend integration. Built with Vite, React, TypeScript, and Tailwind CSS.

## Features

✨ **Modern Dashboard**
- Multi-warehouse support with SAP/WMS toggles
- Warehouse multi-select filtering
- Responsive UI with light/dark mode
- Real-time KPI cards and metrics
- Interactive charts with Recharts
- Activity log tracking

🎨 **Visual Inventory Management**
- 24px grid-based canvas
- Drag-and-drop interface with dnd-kit
- Multi-select and batch operations
- Snap-to-grid functionality
- Pan and zoom controls

📦 **Item Types**
- **Racks**: Multi-floor storage with customizable rows/columns
- **Flat Storage**: Ground-level storage areas
- Rotation support (0/90/180/270°)
- Collision detection and validation

💾 **Data Persistence**
- Supabase backend integration
- Real-time sync capabilities
- Per-zone layouts
- Multi-warehouse management
- Activity logging
- Row-level security (RLS)
- Mock mode fallback when Supabase unavailable

⌨️ **Keyboard Shortcuts**
- `Ctrl/Cmd + Z` - Undo
- `Ctrl/Cmd + Shift + Z` - Redo
- `Ctrl/Cmd + D` - Duplicate
- `R` - Rotate selected items
- `Delete/Backspace` - Delete selected
- `Space + Drag` - Pan canvas
- `Ctrl/Cmd + Wheel` - Zoom

## Tech Stack

- **Frontend**: Vite + React 18 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: Zustand
- **Drag & Drop**: @dnd-kit
- **Backend**: Supabase
- **Charts**: Recharts
- **Routing**: React Router v6
- **Testing**: Vitest

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm, pnpm, or yarn
- Supabase account

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd warehouse-inventory-manager
```

2. Install dependencies:
```bash
npm install
# or
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### Supabase Setup

1. Create a new Supabase project at [https://supabase.com](https://supabase.com)

2. Run the SQL migrations in your Supabase SQL Editor (found in `supabase/sql/` directory):
   - `01_tables.sql` - Create tables
   - `02_rls.sql` - Set up Row Level Security
   - `03_functions.sql` - Create helper functions
   - `10_warehouses.sql` - Add multi-warehouse support

3. **Set up Materialized Views** (required for fast Dashboard and Zone Layout Editor):

   Execute the all-in-one migration file:
   ```sql
   -- In Supabase SQL Editor, copy and paste the entire file:
   supabase/sql/00_execute_all_mvs.sql
   ```

   This will create:
   - Zone normalization functions and aliases table
   - 10 materialized views for pre-calculated metrics
   - Master refresh function for syncing data

   **Verify installation:**
   ```sql
   -- Run this in Supabase SQL Editor:
   supabase/sql/verify_mvs.sql
   ```

   Expected: 10 materialized views with proper permissions

   Or use the client-side verification (after step 4):
   ```bash
   npm run verify-mvs
   ```

4. Get your project URL and anon key from Supabase project settings

### Development

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

### Testing

Run tests:
```bash
npm run test
```

Run tests in watch mode:
```bash
npm run test -- --watch
```

## Project Structure

```
src/
├── components/
│   ├── auth/              # Authentication components
│   ├── inventory/         # Inventory manager components
│   │   ├── canvas/        # Canvas, grid, and item views
│   │   ├── toolbox/       # Item presets and tools
│   │   └── sidepanel/     # Property editor forms
│   ├── layout/            # App shell, sidebar, topbar
│   └── ui/                # shadcn/ui components
├── lib/
│   ├── supabase/          # Supabase client and API
│   ├── geometry.ts        # Geometric calculations
│   ├── validation.ts      # Item validation logic
│   └── cn.ts              # Utility functions
├── pages/                 # Page components
├── store/                 # Zustand store
├── types/                 # TypeScript types
└── hooks/                 # Custom React hooks
```

## Usage

### Managing Warehouses

1. Navigate to the **Dashboard**
2. Click **새 창고** (New Warehouse) button
3. Configure warehouse settings:
   - **Code**: Unique identifier (e.g., WH-US-01)
   - **Name**: Descriptive name
   - **SAP Integration**: Toggle for SAP ERP system
   - **WMS Integration**: Toggle for location mapping (required for inventory canvas)
   - **Time Zone**: Local timezone for the warehouse
4. Select warehouses using the multi-select dropdown to filter dashboard data

#### Important Notes:
- Warehouses with `uses_wms=false` cannot use the inventory map view
- SAP-only warehouses should use tabular inventory views
- The app runs in mock mode (localStorage) if Supabase environment variables are missing

### Creating a New Zone

1. Navigate to the **Zones** page
2. Click **Add Zone**
3. Enter zone code (e.g., "F03") and name
4. Click **Create Zone**

### Adding Items

1. Navigate to the **Inventory** page
2. Ensure **Edit Mode** is enabled
3. Use the toolbox to add racks or flat storage
4. Drag items on the canvas or use the inspector to adjust properties

### Editing Items

1. Select an item on the canvas
2. Use the side panel to edit properties:
   - Location code
   - Position (x, y)
   - Dimensions (width, height)
   - For racks: floors, rows, columns, rotation
   - For flat storage: rows, columns

### Saving Layouts

1. Click **Save** in the top bar
2. Your layout will be persisted to Supabase
3. Activity will be logged automatically

### Multi-Select Operations

1. Click multiple items while holding `Shift`
2. Use keyboard shortcuts for batch operations:
   - Duplicate: `Ctrl/Cmd + D`
   - Rotate: `R`
   - Delete: `Backspace`

## Configuration

### Grid Settings

Adjust grid settings in **Settings** > **Grid**:
- **Cell Size**: 12-48 pixels
- **Columns**: 20-200
- **Rows**: 20-200
- **Snap to Grid**: Enable/disable snapping
- **Show Grid**: Toggle grid visibility

### Theme

Use the theme toggle in the top bar to switch between light and dark modes. Your preference is automatically saved to localStorage.

## Supabase Schema

### Tables

- `users` - User profiles
- `warehouses` - Warehouse definitions with SAP/WMS flags
- `zones` - Warehouse zones (linked to warehouses)
- `layouts` - Zone layout configurations
- `items` - Inventory items (racks, flat storage)
- `activity_log` - Action history

### Row Level Security

- Users can read all zones, layouts, and items
- Users can only modify their own layouts
- Activity logs are read-only for all users

### Realtime (Optional)

Enable realtime subscriptions for multi-user collaboration:
```typescript
const channel = supabase.channel('layouts:F03');
// Subscribe to layout changes
```

## Performance Optimization: Materialized Views

The application uses **PostgreSQL Materialized Views** to pre-calculate expensive queries and improve dashboard/editor performance by 20-100x.

### What are Materialized Views?

Materialized views are pre-calculated query results stored as database tables. Instead of running complex joins and aggregations on every page load, we refresh these views after data syncs.

### MVs in this Project

The application creates 10 materialized views:

1. **zone_capacities_mv** - Zone utilization and capacity (Dashboard Zone Heatmap)
2. **dashboard_inventory_stats_mv** - KPI metrics (total items, quantities, etc.)
3. **inventory_discrepancies_mv** - SAP vs WMS differences
4. **wms_inventory_indexed_mv** - Indexed WMS data with normalized zones/locations
5. **sap_inventory_indexed_mv** - Indexed SAP data
6. **location_inventory_summary_mv** - Pre-aggregated inventory by location (Zone Layout Editor)
7. **item_inventory_summary_mv** - Pre-calculated inventory for each layout component (Zone Layout Editor)
8. **stock_status_distribution_mv** - Stock status percentages (Dashboard pie chart)
9. **expiring_items_mv** - Items expiring within 90 days (pre-calculated days remaining)
10. **slow_moving_items_mv** - Items in stock 60+ days (pre-calculated aging)

### Performance Improvements

| Query | Before (real-time) | After (MV) | Speedup |
|-------|-------------------|------------|---------|
| Dashboard KPIs | 2-5s | 50ms | 40-100x |
| Zone Heatmap | 5-10s | 100ms | 50-100x |
| Location Lookup | 500ms-2s | 10ms | 50-200x |
| Discrepancy Analysis | 10-30s | 200ms | 50-150x |

### How to Refresh MVs

MVs are automatically refreshed when you click **"Sync All"** in the application. This calls the `refresh_all_materialized_views()` PostgreSQL function.

You can also manually refresh via SQL:
```sql
-- Refresh all MVs
SELECT refresh_all_materialized_views();

-- Refresh a specific MV
REFRESH MATERIALIZED VIEW CONCURRENTLY location_inventory_summary_mv;
```

### Zone Normalization

The system handles zone code variations automatically:
- `EA2-A`, `EA2A`, `ea2-a` → all normalized to `EA2A`
- Uses `zone_aliases` table for flexible mapping
- Zone + Location simultaneous matching:
  - Flat items: exact location match
  - Rack items: prefix pattern match (e.g., "A1-01-02" matches "A1")

## WMS Integration (Coming Soon)

The application includes stubs for Warehouse Management System integration:
- `importFromWms(payload)` - Import layouts from external WMS
- `exportToWms()` - Export current layout to WMS format

Implement these methods in `src/store/useLayoutStore.ts` for your specific WMS.

## Deployment

### Vercel

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel project settings
4. Deploy

### Netlify

1. Build the project: `npm run build`
2. Deploy the `dist` folder to Netlify
3. Add environment variables in Netlify site settings

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm install -g serve
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
```

## Troubleshooting

### Materialized View 404 Errors

If you encounter 404 errors when accessing materialized views:
1. Verify SQL files have been executed in Supabase Dashboard
2. Run [verify_mvs.sql](supabase/sql/verify_mvs.sql) in Supabase SQL Editor
3. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed steps
4. Use `npm run verify-mvs` to test REST API access

### Supabase Connection Issues

- Verify your `.env` file contains correct credentials
- Check that RLS policies are properly configured
- Ensure your Supabase project is not paused

### Build Errors

- Clear node_modules and reinstall: `rm -rf node_modules package-lock.json && npm install`
- Check for TypeScript errors: `npm run build`

### Layout Not Saving

- Check browser console for errors
- Verify authentication (sign in again)
- Check Supabase project logs

### Performance Issues

If the Dashboard or Zone Layout Editor is slow:
- Ensure materialized views are created (see setup instructions above)
- Check if MVs need refreshing: Click "Sync All" button
- Verify MVs have data: Run `SELECT COUNT(*) FROM location_inventory_summary_mv;`

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Acknowledgments

- [shadcn/ui](https://ui.shadcn.com/) for beautiful UI components
- [dnd-kit](https://dndkit.com/) for drag and drop functionality
- [Supabase](https://supabase.com/) for backend infrastructure
- [Recharts](https://recharts.org/) for data visualization

## Support

For issues and questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review the documentation

---

Built with ❤️ for warehouse managers everywhere.
