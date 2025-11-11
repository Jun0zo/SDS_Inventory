# Google Sheets ETL Integration - Setup Guide

## Quick Start

### 1. Backend Setup

```bash
# Navigate to server directory
cd server

# Install Python dependencies
pip install -r requirements.txt

# Start the ETL server
./start.sh
# Or manually: uvicorn app:app --reload --port 8787
```

The server will run at `http://localhost:8787`
- API docs: `http://localhost:8787/docs`
- Health check: `http://localhost:8787/health`

### 2. Frontend Configuration

Add to your `.env` file:
```env
VITE_ETL_BASE_URL=http://localhost:8787
```

### 3. Google Sheets API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select a project
3. Enable "Google Sheets API"
4. Create API Key: Credentials → Create Credentials → API Key
5. Copy the API key (starts with "AIza...")

### 4. Prepare Your Google Sheet

Required columns (exact names):
- `Item Code` - Item identifier
- `Item Nm` - Item name
- `Zone Cd` - Zone code
- `Cell No.` - Location
- `Available Qty.` - Available quantity
- `Tot. Qty.` - Total quantity
- `Inb. Date` - Inbound date (optional)
- `Valid Date` - Valid date (optional)

**Make the spreadsheet publicly readable** or configure OAuth (advanced)

### 5. Configure in the App

1. Start the React app: `npm run dev`
2. Navigate to **Settings** → **Google Sheets** tab
3. Enter your Google API Key
4. Add warehouse configurations:
   - Warehouse Code (e.g., "EA2")
   - Spreadsheet ID (from Google Sheets URL)
   - Sheet Name (tab name, e.g., "WMS_LRN3")
5. Click **Save Configuration**
6. Test each warehouse with the **Test** button

### 6. Sync Data

#### Option A: From Settings
- Click **Sync** button next to each warehouse

#### Option B: From Dashboard
- Find the **WMS Data Sync** panel
- Select a warehouse
- Click **Sync Now**

## File Structure

```
project/
├── server/                    # FastAPI backend
│   ├── app.py               # Main application
│   ├── requirements.txt     # Python dependencies
│   ├── start.sh            # Startup script
│   └── data/               # Data storage
│       ├── config.json     # Server configuration
│       └── snapshots/      # JSON snapshots
│           └── {warehouse}/
│               ├── latest.json
│               └── YYYYMMDD_HHMMSS.json
│
└── src/                      # React frontend
    ├── lib/
    │   └── etl.ts          # ETL API client
    ├── store/
    │   ├── useServerConfig.ts  # Config management
    │   └── useSyncStore.ts     # Sync state
    ├── pages/
    │   └── settings.tsx    # Settings with Sheets tab
    └── components/
        └── WmsSyncPanel.tsx # Dashboard sync widget
```

## Features

### Backend (FastAPI)
- ✅ Google Sheets API integration
- ✅ Per-warehouse spreadsheet mapping
- ✅ JSON snapshot storage (filesystem)
- ✅ Dashboard-oriented data transformation
- ✅ RESTful API with OpenAPI docs

### Frontend (React)
- ✅ Settings UI for API key and warehouse sheets
- ✅ Test connection before saving
- ✅ One-click sync from Settings or Dashboard
- ✅ Visual feedback with loading states
- ✅ Summary statistics display
- ✅ Top items by quantity
- ✅ Automatic error handling with toasts

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/config` | GET | Get server configuration |
| `/config` | PUT | Update server configuration |
| `/sync/wms` | POST | Sync warehouse data |
| `/test-connection` | POST | Test sheet connection |
| `/snapshot/latest/{code}` | GET | Get latest snapshot |
| `/snapshots/{code}` | GET | List all snapshots |

## Troubleshooting

### Server won't start
```bash
# Check Python version (3.8+ required)
python --version

# Install pip if missing
python -m ensurepip --upgrade

# Try virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### "Permission denied" from Google Sheets
- Ensure spreadsheet is publicly readable
- Check API key has Sheets API enabled
- Verify spreadsheet ID and sheet name

### CORS errors in browser
- Ensure ETL server is running (`http://localhost:8787`)
- Check `VITE_ETL_BASE_URL` in `.env`
- Restart React dev server after changing `.env`

### No data after sync
- Check column names match exactly (case-sensitive)
- Ensure sheet has data rows below header
- Try **Test** button first to verify connection

## Next Steps

1. **Schedule automatic syncs**: Use cron or GitHub Actions
2. **Add authentication**: Protect the ETL server endpoints
3. **Cloud deployment**: Deploy server to AWS/GCP/Azure
4. **Advanced transforms**: Add business logic to snapshot building
5. **Historical analysis**: Query snapshots over time

## Support

- Server logs: Check terminal running `uvicorn`
- API docs: Visit `http://localhost:8787/docs`
- React errors: Check browser console
- Data issues: Verify Google Sheets format
