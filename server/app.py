"""Main FastAPI application with routes."""
import datetime
from fastapi import HTTPException
from config import create_app
from models import ServerConfig, SyncRequest, ApiResponse
from storage import load_config, save_config, write_snapshot, read_latest_snapshot
from sheets import fetch_sheet_values, normalize
from snapshot import build_dashboard_snapshot

# Import extended functionality
from app_extended import app_ext

# Create the FastAPI app
app = create_app()

# Mount extended app
app.mount("/api", app_ext)

@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"ok": True, "timestamp": datetime.datetime.utcnow().isoformat() + "Z"}

@app.get("/config", response_model=ServerConfig)
def get_config():
    """Get the current server configuration."""
    return load_config()

@app.put("/config", response_model=ServerConfig)
def update_config(cfg: ServerConfig):
    """Update the server configuration."""
    # Basic validation: ensure spreadsheet_id is provided for each warehouse
    for warehouse_code, sheet_config in cfg.warehouses.items():
        if not sheet_config.spreadsheet_id:
            raise HTTPException(
                status_code=400,
                detail=f"Warehouse {warehouse_code} missing spreadsheet_id"
            )
    
    save_config(cfg)
    return cfg

@app.post("/sync/wms", response_model=ApiResponse)
async def sync_wms_data(req: SyncRequest):
    """
    Sync WMS data from Google Sheets for a specific warehouse.
    Fetches data, normalizes it, and saves a snapshot.
    """
    # Load configuration
    cfg = load_config()
    
    # Validate warehouse exists
    warehouse_sheet = cfg.warehouses.get(req.warehouse_code)
    if not warehouse_sheet:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown warehouse_code: {req.warehouse_code}"
        )
    
    try:
        # Fetch data from Google Sheets
        values = await fetch_sheet_values(
            warehouse_sheet.spreadsheet_id,
            warehouse_sheet.sheet_name,
            None
        )
        
        # Validate data exists
        if not values or len(values) == 0:
            raise HTTPException(
                status_code=400,
                detail="Empty sheet or wrong sheet name"
            )
        
        # Normalize the data
        rows = normalize(values)
        
        # Build dashboard snapshot
        dashboard_data = build_dashboard_snapshot(rows)
        
        # Create full snapshot
        snapshot = {
            "warehouse_code": req.warehouse_code,
            "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
            "spreadsheet_id": warehouse_sheet.spreadsheet_id,
            "sheet_name": warehouse_sheet.sheet_name,
            "rows_count": len(rows),
            "dashboard": dashboard_data,
            "raw_header": values[0] if values else [],
        }
        
        # Save snapshot
        saved_path = write_snapshot(req.warehouse_code, snapshot)
        
        return ApiResponse(
            ok=True,
            message=f"Snapshot saved: {saved_path}",
            data={
                "path": saved_path,
                "rows_count": len(rows),
                "zones_count": dashboard_data["summary"]["zone_count"]
            }
        )
        
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(
                status_code=400,
                detail=f"Spreadsheet or sheet not found. Check spreadsheet_id and sheet_name."
            )
        elif e.response.status_code == 403:
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied. Check API key and spreadsheet sharing settings."
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Google Sheets API error: {str(e)}"
            )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Sync failed: {str(e)}"
        )

@app.get("/snapshot/latest/{warehouse_code}", response_model=ApiResponse)
def get_latest_snapshot(warehouse_code: str):
    """Get the latest snapshot for a warehouse."""
    data = read_latest_snapshot(warehouse_code)
    
    if not data:
        return ApiResponse(
            ok=False,
            message=f"No snapshot found for warehouse {warehouse_code}"
        )
    
    return ApiResponse(
        ok=True,
        message="Snapshot retrieved successfully",
        data=data
    )

@app.get("/snapshots/{warehouse_code}")
def list_snapshots(warehouse_code: str):
    """List all available snapshots for a warehouse."""
    import os
    from pathlib import Path
    
    snapshot_dir = Path("data/snapshots") / warehouse_code
    
    if not snapshot_dir.exists():
        return {
            "ok": False,
            "message": f"No snapshots found for warehouse {warehouse_code}",
            "snapshots": []
        }
    
    snapshots = []
    for file_path in sorted(snapshot_dir.glob("*.json"), reverse=True):
        if file_path.name != "latest.json":
            stat = file_path.stat()
            snapshots.append({
                "filename": file_path.name,
                "size": stat.st_size,
                "modified": datetime.datetime.fromtimestamp(stat.st_mtime).isoformat() + "Z"
            })
    
    return {
        "ok": True,
        "warehouse_code": warehouse_code,
        "snapshots": snapshots[:50]  # Limit to 50 most recent
    }

@app.post("/test-connection", response_model=ApiResponse)
async def test_connection(req: SyncRequest):
    """Test connection to Google Sheets without saving snapshot."""
    cfg = load_config()
    
    warehouse_sheet = cfg.warehouses.get(req.warehouse_code)
    if not warehouse_sheet:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown warehouse_code: {req.warehouse_code}"
        )
    
    try:
        # Try to fetch just the header row
        values = await fetch_sheet_values(
            warehouse_sheet.spreadsheet_id,
            warehouse_sheet.sheet_name,
            None
        )
        
        if not values or len(values) == 0:
            return ApiResponse(
                ok=False,
                message="Sheet is empty or cannot be accessed"
            )
        
        return ApiResponse(
            ok=True,
            message=f"Successfully connected. Found {len(values)} rows, {len(values[0])} columns",
            data={
                "rows": len(values),
                "columns": len(values[0]) if values else 0,
                "header": values[0] if values else []
            }
        )
        
    except Exception as e:
        return ApiResponse(
            ok=False,
            message=f"Connection failed: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    import os

    # Use PORT environment variable (for Cloud Run) or default to 8787 (for local dev)
    port = int(os.getenv("PORT", "8787"))
    uvicorn.run(app, host="0.0.0.0", port=port, reload=True)
