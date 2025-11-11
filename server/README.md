# Google Sheets ETL Server

FastAPI backend for fetching Google Sheets data and storing JSON snapshots for the Warehouse Management System.

## Features

- ✅ **Google Sheets Integration**: Fetch data from Google Sheets via API
- ✅ **Per-Warehouse Configuration**: Map each warehouse to its own spreadsheet
- ✅ **JSON Snapshots**: Store timestamped snapshots on filesystem
- ✅ **Dashboard-Ready Data**: Transform raw data for UI consumption
- ✅ **RESTful API**: Clean endpoints for configuration and sync

## Setup

### 1. Install Dependencies

```bash
cd server
pip install -r requirements.txt
```

### 2. Get Google Sheets API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable "Google Sheets API"
4. Go to "Credentials" → "Create Credentials" → "API Key"
5. (Optional) Restrict the API key to Google Sheets API

### 3. Prepare Your Google Sheet

Ensure your sheet has these columns (exact names):
- `Item Code` - Unique item identifier
- `Item Nm` - Item name/description
- `Zone Cd` - Warehouse zone code
- `Cell No.` - Storage location
- `Available Qty.` - Available quantity
- `Tot. Qty.` - Total quantity
- `Inb. Date` - Inbound date (optional)
- `Valid Date` - Valid until date (optional)

**Important**: 
- Make the spreadsheet publicly readable OR
- Share it with the service account (if using OAuth instead of API key)

### 4. Run the Server

```bash
uvicorn app:app --reload --port 8787
```

Or with custom host:
```bash
uvicorn app:app --host 0.0.0.0 --port 8787 --reload
```

## API Endpoints

### Configuration

#### GET `/config`
Get current server configuration including API key and warehouse mappings.

#### PUT `/config`
Update server configuration.

```json
{
  "google_api_key": "AIza...",
  "warehouses": {
    "EA2": {
      "spreadsheet_id": "1abc...",
      "sheet_name": "WMS_LRN3"
    }
  }
}
```

### Sync Operations

#### POST `/sync/wms`
Fetch data from Google Sheets and create a snapshot.

```json
{
  "warehouse_code": "EA2"
}
```

#### POST `/test-connection`
Test connection to Google Sheets without saving data.

```json
{
  "warehouse_code": "EA2"
}
```

### Snapshots

#### GET `/snapshot/latest/{warehouse_code}`
Get the latest snapshot for a warehouse.

#### GET `/snapshots/{warehouse_code}`
List all available snapshots for a warehouse.

## File Structure

```
server/
├── app.py           # Main FastAPI application
├── config.py        # App configuration
├── models.py        # Pydantic models
├── sheets.py        # Google Sheets fetching
├── snapshot.py      # Snapshot building
├── storage.py       # File I/O utilities
└── data/
    ├── config.json  # Persisted configuration
    └── snapshots/
        └── {warehouse_code}/
            ├── latest.json
            └── 20251029_095312.json
```

## Frontend Integration

In the React app:

1. Add to `.env`:
```env
VITE_ETL_BASE_URL=http://localhost:8787
```

2. Use the Settings page to configure:
   - Google Sheets API Key
   - Warehouse → Spreadsheet mappings

3. Use the WMS Sync Panel on Dashboard to:
   - Trigger syncs
   - View latest snapshot data

## Data Flow

1. **Configure**: Set API key and spreadsheet mappings in Settings
2. **Sync**: Trigger sync for a specific warehouse
3. **Fetch**: Server fetches data from Google Sheets API
4. **Transform**: Data is normalized and typed
5. **Snapshot**: JSON snapshot saved to filesystem
6. **Display**: Dashboard shows summary statistics

## Security Notes

- **API Key**: Store securely, never commit to git
- **CORS**: Currently allows all origins (development mode)
- **Spreadsheet Access**: Sheets must be publicly readable or shared
- **File System**: Snapshots stored locally (not encrypted)

## Production Considerations

1. **CORS**: Update `config.py` to restrict origins:
```python
allow_origins=["https://your-domain.com"]
```

2. **API Key**: Use environment variables:
```python
import os
api_key = os.getenv("GOOGLE_API_KEY")
```

3. **Persistence**: Consider cloud storage (S3, GCS) for snapshots

4. **Scheduling**: Add cron job or scheduler for automatic syncs:
```bash
# Crontab example (every hour)
0 * * * * curl -X POST http://localhost:8787/sync/wms -H "Content-Type: application/json" -d '{"warehouse_code":"EA2"}'
```

5. **Monitoring**: Add logging and error tracking

## Troubleshooting

### "Permission denied" error
- Check if spreadsheet is publicly readable
- Verify API key has Google Sheets API enabled

### "Sheet not found" error
- Check sheet name spelling (case-sensitive)
- Verify spreadsheet ID is correct

### Empty data
- Check column headers match exactly
- Ensure sheet has data rows below header

### CORS errors
- Ensure server is running
- Check VITE_ETL_BASE_URL in frontend .env

## Development

### Run Tests
```bash
pytest
```

### Format Code
```bash
black .
```

### Type Checking
```bash
mypy .
```
