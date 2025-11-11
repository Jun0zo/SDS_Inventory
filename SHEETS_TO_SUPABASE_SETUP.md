# Google Sheets to Supabase RAW Data Integration

## Overview

This extension adds comprehensive Google Sheets integration with Supabase storage for warehouse data management. The system supports both WMS (Warehouse Management System) and SAP data sources with configurable classification and splitting logic.

## Architecture

```
Google Sheets → FastAPI Backend → Supabase RAW Tables → Dashboard
                     ↑                        ↓
             Configuration & Mapping    Future: Snapshots
```

## Quick Setup

### 1. Database Setup (Supabase)

Run these SQL migrations in order:
```sql
-- Run in Supabase SQL Editor
1. supabase/sql/20_sheet_sources.sql     -- Sheet source registry
2. supabase/sql/21_warehouse_bindings.sql -- Warehouse ↔ source mappings  
3. supabase/sql/22_raw_rows.sql          -- RAW data storage
```

### 2. Backend Setup (FastAPI)

```bash
# Navigate to server directory
cd server

# Install dependencies (including new Supabase client)
pip install -r requirements.txt

# Configure environment (.env file)
GOOGLE_API_KEY=your-google-api-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key  # Use service key, not anon key!

# Start server
uvicorn app:app --reload --port 8787
```

### 3. Frontend Setup

```bash
# Install any missing dependencies
npm install

# Configure environment (.env)
VITE_ETL_BASE_URL=http://localhost:8787
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Start development server
npm run dev
```

## Features

### 🎯 Sheet Sources Configuration

**Navigate to: Sheet Sources** (sidebar menu)

Configure Google Sheets as data sources with:
- **WMS Sources**: Zone/Location-based tracking
  - Zone Column mapping
  - Location Column mapping  
  - Item Code Column
  - Multiple Lot Number columns
  
- **SAP Sources**: ERP integration
  - Item Code Column
  - Lot Number columns
  - Split option (group by Plant, Division, etc.)

**Key Actions:**
1. Click "New Source"
2. Enter Spreadsheet ID and Sheet Name
3. Click "Load Headers" to fetch column names
4. Map columns to classification fields
5. Save source configuration

### 🔗 Warehouse Bindings

**Navigate to: Dashboard → Warehouse Settings**

Map warehouses to sheet sources:
- Select multiple WMS sources per warehouse
- Select multiple SAP sources per warehouse
- **Split Value Selection**: When a source has "Split by Column" enabled, select which value to use (e.g., Plant A vs Plant B)
  - Each split value can only be assigned to one warehouse (prevents conflicts)
  - Used split values show which warehouse is using them
  - Option to use all data if no split value is selected
- System automatically updates `uses_wms` and `uses_sap` flags

**Split Feature Example:**
- Sheet Source: "Main WMS" with split by "Plant" column
- Values in data: Plant A, Plant B, Plant C
- Warehouse EA2: Binds to "Main WMS" → Select "Plant A"
- Warehouse DP1: Cannot select "Plant A" (already used by EA2), can select "Plant B" or "Plant C"

### 📊 Data Ingestion

**Navigate to: Dashboard → Data Ingestion Panel**

Process data from sheets to Supabase:
1. Select warehouse
2. Choose source types (WMS/SAP)
3. Click "Ingest RAW"
4. View results and errors

**Features:**
- Dry run mode for testing
- Batch processing
- Error reporting
- Raw data preview

## Data Model

### Sheet Sources (`sheet_sources`)
```json
{
  "id": "uuid",
  "label": "Main WMS Sheet",
  "type": "wms",
  "spreadsheet_id": "1abc...",
  "sheet_name": "Sheet1",
  "classification": {
    "zone_col": "Zone Cd",
    "location_col": "Cell No.",
    "item_col": "Item Code",
    "lot_col": "Lot No."
  }
}
```

### Warehouse Bindings (`warehouse_bindings`)
```json
{
  "warehouse_code": "EA2",
  "source_bindings": {
    "uuid1": {
      "type": "wms",
      "split_value": "Plant A"
    },
    "uuid2": {
      "type": "wms",
      "split_value": null
    },
    "uuid3": {
      "type": "sap",
      "split_value": "Division 01"
    }
  }
}
```

**Fields:**
- `source_bindings`: Dictionary mapping source_id to binding configuration
- `type`: Either "wms" or "sap"
- `split_value`: Optional split value to filter data (only for sources with split enabled)

### Raw Rows (`raw_rows`)
```json
{
  "warehouse_code": "EA2",
  "source_id": "uuid",
  "source_type": "wms",
  "header": ["Zone Cd", "Cell No.", ...],
  "row": { "Zone Cd": "A", "Cell No.": "A01", ... },
  "zone": "A",
  "location": "A01",
  "item_code": "ITEM001",
  "lot_key": "LOT123|PROD456",
  "available_qty": 100,
  "fetched_at": "2024-01-01T00:00:00Z"
}
```

## API Endpoints

### Extended API (`/api/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config/sources` | GET | List sheet sources |
| `/api/config/sources` | POST | Create source |
| `/api/config/sources/{id}` | PUT | Update source |
| `/api/config/sources/{id}` | DELETE | Delete source |
| `/api/config/sources/{id}/split-values` | GET | Get available split values for a source |
| `/api/config/bindings` | GET | List all warehouse bindings |
| `/api/config/bindings/{code}` | GET | Get warehouse binding |
| `/api/config/bindings/{code}` | PUT | Save warehouse binding |
| `/api/config/bindings/{code}` | DELETE | Delete warehouse binding |
| `/api/sheets/headers` | GET | Preview sheet headers |
| `/api/ingest` | POST | Ingest data to Supabase |
| `/api/raw/latest/{code}` | GET | Get latest raw data |
| `/api/snapshot/build` | POST | Build snapshot (stub) |

## Classification Logic

### WMS Classification
- **Zone**: Physical warehouse zone (e.g., "A", "B", "C")
- **Location**: Specific location within zone (e.g., "A01-01")
- **Item Code**: Product identifier
- **Lot Key**: Combined lot numbers separated by "|"

### SAP Classification
- **Item Code**: Material/product code
- **Lot Key**: Combined lot identifiers
- **Split Key**: Optional grouping column (Plant, Division, etc.)
  - When enabled, data is grouped by this column
  - Default: "__UNSPECIFIED__" for empty values

## Data Flow

1. **Configuration Phase**
   - Create sheet sources with column mappings
   - Bind warehouses to sources
   
2. **Ingestion Phase**
   - Select warehouse and source types
   - Fetch data from Google Sheets
   - Normalize and type-convert
   - Apply classification rules
   - Store in `raw_rows` table
   
3. **Usage Phase** (Future)
   - Build snapshots from raw data
   - Aggregate for dashboard
   - Generate reports

## Type Conversion

Automatic conversions during ingestion:
- **Numbers**: Remove commas, convert to float
- **Dates**: Parse MM/DD/YYYY or ISO format → ISO date
- **Text**: Trim whitespace, empty → null
- **Quantities**: "Available Qty.", "Tot. Qty." → numeric
- **Dates**: "Inb. Date", "Valid Date", "Prod. Date" → date

## Security

- **Backend**: Uses Supabase service key (full access)
- **Frontend**: Uses Supabase anon key (RLS protected)
- **Google Sheets**: Must be publicly readable or API key authorized
- **RLS Policies**: Read-all, write-own for most tables

## Troubleshooting

### "Supabase connection not available"
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in server .env
- Ensure service key (not anon key) is used

### "No data found" during ingestion
- Verify sheet has data rows below header
- Check column names match exactly (case-sensitive)
- Ensure spreadsheet is publicly readable

### Empty classification dropdowns
- Click "Load Headers" button first
- Check spreadsheet ID is correct
- Verify Google API key has Sheets API enabled

### Ingestion errors
- Check item_col is mapped (required)
- Verify source is bound to warehouse
- Review error details in result panel

## Development

### Testing Ingestion
```python
# Dry run to test without saving
POST /api/ingest
{
  "warehouse_code": "EA2",
  "types": ["wms", "sap"],
  "dry_run": true
}
```

### View Raw Data
```python
GET /api/raw/latest/EA2?source_type=wms&limit=100
```

### Future Enhancements
- [ ] Snapshot building from raw data
- [ ] Incremental updates (only new/changed rows)
- [ ] Column alias mapping (Korean ↔ English)
- [ ] Scheduled automatic ingestion
- [ ] Data validation rules
- [ ] Export to Excel/CSV
- [ ] Audit trail for changes
