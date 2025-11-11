# Production Line Management

This document describes the Production Line feature that allows warehouses to manage factory production lines and their Bill of Materials (BOM).

## Overview

The Production Line feature extends the warehouse management system by adding the ability to:
- Define multiple production lines within a warehouse
- Configure how many lines of each type exist
- Specify what product each line produces
- Define the Bill of Materials (BOM) - which materials and quantities are consumed to produce one unit

## Architecture

### Database Schema

The feature uses two main tables:

#### `production_lines`
Stores the main production line configuration:
- `id`: UUID primary key
- `warehouse_id`: Foreign key to warehouses table
- `line_code`: Unique code within warehouse (e.g., "LINE-A")
- `line_name`: Human-readable name (e.g., "Assembly Line A")
- `line_count`: Number of physical lines (integer, default 1)
- `output_product_code`: Optional product code being produced
- `output_product_name`: Optional product name being produced
- `created_by`, `created_at`, `updated_at`: Audit fields

#### `production_line_materials`
Stores the BOM (Bill of Materials) for each line:
- `id`: UUID primary key
- `production_line_id`: Foreign key to production_lines table
- `material_code`: Material/component code
- `material_name`: Material/component name
- `quantity_per_unit`: How much of this material is needed per unit produced (decimal)
- `unit`: Unit of measurement (e.g., "EA", "KG", "L")
- `created_at`: Audit timestamp

### Type Definitions

Located in `src/types/warehouse.ts`:

```typescript
// Material consumed in production
export type ProductionLineMaterial = {
  id: string;
  material_code: string;
  material_name: string;
  quantity_per_unit: number; // Materials needed per unit produced
  unit: string; // Unit (e.g., EA, KG, L)
};

// Production Line
export type ProductionLine = {
  id: string;
  warehouse_id: string;
  line_code: string;
  line_name: string;
  line_count: number; // Number of lines
  output_product_code?: string | null;
  output_product_name?: string | null;
  materials: ProductionLineMaterial[]; // BOM
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};
```

## User Interface Components

### 1. Warehouse Management Modal
- Location: `src/components/warehouse/warehouse-management-modal.tsx`
- Added "Production" column with "Lines" button for each warehouse
- Clicking the button opens the Production Line Management Dialog

### 2. Production Line Management Dialog
- Location: `src/components/warehouse/production-line-management-dialog.tsx`
- Full-screen dialog showing all production lines for a warehouse
- Handles loading, creating, updating, and deleting production lines

### 3. Production Line Management Component
- Location: `src/components/warehouse/production-line-management.tsx`
- Displays all production lines in card format
- Shows line details and BOM table for each line
- Provides edit and delete actions

### 4. Production Line Dialog (Add/Edit)
- Location: `src/components/warehouse/production-line-dialog.tsx`
- Form for creating or editing a production line
- Sections:
  - **Basic Info**: Line code, name, and count
  - **Output Product** (optional): Product code and name
  - **BOM**: Add/remove materials with quantities

## Usage

### Creating a Production Line

1. Open Warehouse Management (from settings or main menu)
2. Click the "Lines" button for the desired warehouse
3. Click "Add Line" (or "첫 번째 라인 추가" if empty)
4. Fill in the form:
   - **Line Code**: Unique identifier (e.g., "LINE-A", "ASSY-01")
   - **Line Name**: Descriptive name (e.g., "Assembly Line A")
   - **Line Count**: Number of physical lines (must be ≥ 1)
   - **Output Product** (optional): Product code and name
   - **BOM**: Add materials by entering:
     - Material code
     - Material name
     - Quantity per unit produced
     - Unit of measurement
5. Click "추가" (Add) to save

### Editing a Production Line

1. Open the Production Lines dialog for a warehouse
2. Click the edit icon on the line you want to modify
3. Update the fields as needed
4. Click "수정" (Update) to save changes

### Deleting a Production Line

1. Open the Production Lines dialog for a warehouse
2. Click the delete icon on the line you want to remove
3. Confirm the deletion in the alert dialog

## Database Migration

To set up the production line tables in your database, run the SQL migration file:

```bash
psql -d your_database < migrations/add_production_lines.sql
```

Or use your Supabase dashboard to execute the SQL in:
`migrations/add_production_lines.sql`

The migration includes:
- Table creation with proper constraints
- Indexes for performance
- Row Level Security (RLS) policies
- Automatic timestamp update trigger
- Proper foreign key relationships with CASCADE delete

## Future Enhancements

Potential improvements for this feature:

1. **Production Tracking**
   - Track actual production output per line
   - Monitor material consumption vs. BOM
   - Production efficiency metrics

2. **Material Inventory Integration**
   - Deduct materials from inventory when production occurs
   - Alert when material levels are low for production
   - Automatic material requirement planning (MRP)

3. **Production Scheduling**
   - Schedule production runs
   - Optimize line utilization
   - Downtime tracking

4. **Cost Tracking**
   - Material costs per unit
   - Labor costs per line
   - Total production cost calculation

5. **Quality Control**
   - Defect tracking per line
   - Quality metrics and reports
   - Scrap and rework tracking

## API Integration (TODO)

The current implementation includes placeholder TODO comments for API integration:

```typescript
// TODO: Implement API call to load production lines
// TODO: Implement API call to create production line
// TODO: Implement API call to update production line
// TODO: Implement API call to delete production line
```

These should be implemented using Supabase client to:
1. Query `production_lines` with joined `production_line_materials`
2. Insert/update/delete operations with proper error handling
3. Real-time subscriptions for multi-user environments

## Notes

- Each warehouse can have multiple production lines
- Each production line can have multiple materials in its BOM
- Line codes must be unique within a warehouse
- Material quantities can be fractional (stored as DECIMAL(10,4))
- Deleting a warehouse will CASCADE delete all associated production lines
- Deleting a production line will CASCADE delete all associated materials
