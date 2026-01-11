"""Extended API endpoints for sheet sources and data ingestion"""
import os
import datetime
import uuid
from fastapi import FastAPI, HTTPException, Depends, Query
from typing import List, Optional, Dict, Any
import logging

from models_extended import (
    SheetSource,
    CreateSheetSource,
    UpdateSheetSource,
    WarehouseBinding,
    CreateWarehouseBinding,
    IngestRequest,
    IngestResult,
    HeaderPreviewRequest,
    HeaderPreviewResponse,
    SplitValuesResponse,
    SplitValueInfo,
    ZoneCapacityResponse,
    FactoryExtended,
    FactoryListResponse,
    FactoryResponse,
    FactoryCreateRequest,
    FactoryUpdateRequest,
    ProductionLineExtended,
    ProductionLineListResponse,
    ProductionLineResponse,
    ProductionLineCreateRequest,
    ProductionLineUpdateRequest
)
from supabase_client import (
    check_supabase,
    get_sheet_sources,
    create_sheet_source,
    update_sheet_source,
    delete_sheet_source,
    get_warehouse_binding,
    upsert_warehouse_binding,
    get_latest_raw_data,
    call_snapshot_function,
    list_warehouse_bindings,
    delete_warehouse_binding,
    get_factories,
    get_factory,
    create_factory,
    update_factory,
    delete_factory,
    get_production_lines,
    get_all_production_lines,
    create_production_line,
    update_production_line,
    delete_production_line,
    supabase
)
try:
    from ingest_new import ingest_warehouse_data
except ImportError:
    from ingest import ingest_warehouse_data  # Fallback to old
from sheets import fetch_sheet_values
from storage import load_config
from column_config import (
    load_column_config,
    save_column_config,
    reset_column_config,
    list_all_configs
)
from location_inventory import (
    get_location_inventory,
    get_multiple_locations_inventory,
    get_rack_inventory,
    LocationInventoryRequest,
    BatchLocationInventoryRequest,
    LocationInventorySummary
)
from zone_capacity import get_zone_capacity_manager
from pydantic import BaseModel
from typing import Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app extension
app_ext = FastAPI(title="Sheet Sources Extension", version="1.0.0")

# Dependency to check Supabase connection
def require_supabase():
    if not check_supabase():
        raise HTTPException(
            status_code=503,
            detail="Supabase connection not available. Check SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables."
        )
    return True

# Sheet Sources endpoints
@app_ext.get("/config/sources", response_model=List[SheetSource])
async def list_sheet_sources(
    type: Optional[str] = Query(None, regex="^(wms|sap)$"),
    _: bool = Depends(require_supabase)
):
    """List sheet sources, optionally filtered by type"""
    try:
        sources = await get_sheet_sources(type)
        return sources
    except Exception as e:
        logger.error(f"Error listing sources: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app_ext.post("/config/sources", response_model=SheetSource)
async def create_source(
    source: CreateSheetSource,
    _: bool = Depends(require_supabase)
):
    """Create a new sheet source"""
    try:
        data = source.model_dump()
        # Convert classification to dict for JSONB storage
        data['classification'] = data['classification'] if isinstance(data['classification'], dict) else {}
        
        result = await create_sheet_source(data)
        return result
    except Exception as e:
        logger.error(f"Error creating source: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app_ext.put("/config/sources/{source_id}", response_model=SheetSource)
async def update_source(
    source_id: str,
    update: UpdateSheetSource,
    _: bool = Depends(require_supabase)
):
    """Update an existing sheet source"""
    try:
        data = update.model_dump(exclude_none=True)
        if 'classification' in data:
            # Ensure classification is a dict
            data['classification'] = data['classification'] if isinstance(data['classification'], dict) else {}
        
        result = await update_sheet_source(source_id, data)
        if not result:
            raise HTTPException(status_code=404, detail="Source not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating source: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app_ext.delete("/config/sources/{source_id}")
async def delete_source(
    source_id: str,
    _: bool = Depends(require_supabase)
):
    """Delete a sheet source"""
    try:
        deleted = await delete_sheet_source(source_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Source not found")
        return {"message": "Source deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting source: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Warehouse Bindings endpoints
@app_ext.get("/config/bindings")
async def list_bindings(_: bool = Depends(require_supabase)):
    """List all warehouse bindings"""
    try:
        bindings = await list_warehouse_bindings()
        return {"bindings": bindings}
    except Exception as e:
        logger.error(f"Error listing bindings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app_ext.get("/config/bindings/{warehouse_code}", response_model=Optional[WarehouseBinding])
async def get_binding(
    warehouse_code: str,
    _: bool = Depends(require_supabase)
):
    """Get warehouse binding configuration"""
    try:
        binding = await get_warehouse_binding(warehouse_code)
        return binding
    except Exception as e:
        logger.error(f"Error getting binding: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app_ext.put("/config/bindings/{warehouse_code}", response_model=WarehouseBinding)
async def save_binding(
    warehouse_code: str,
    binding: CreateWarehouseBinding,
    _: bool = Depends(require_supabase)
):
    """Create or update warehouse binding"""
    try:
        # Convert SourceBinding objects to JSON-serializable dict
        source_bindings_json = {}
        for source_id, binding_info in binding.source_bindings.items():
            source_bindings_json[source_id] = {
                'type': binding_info.type,
                'split_value': binding_info.split_value
            }
        
        data = {
            'warehouse_code': warehouse_code,
            'source_bindings': source_bindings_json
        }
        
        result = await upsert_warehouse_binding(data)
        return result
    except Exception as e:
        logger.error(f"Error saving binding: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app_ext.delete("/config/bindings/{warehouse_code}")
async def remove_binding(
    warehouse_code: str,
    _: bool = Depends(require_supabase)
):
    """Delete warehouse binding by code"""
    try:
        deleted = await delete_warehouse_binding(warehouse_code)
        if not deleted:
            raise HTTPException(status_code=404, detail="Binding not found")
        return {"message": "Binding deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting binding: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Split values endpoint
@app_ext.get("/config/sources/{source_id}/split-values", response_model=SplitValuesResponse)
async def get_split_values(
    source_id: str,
    exclude_warehouse: Optional[str] = Query(None),
    _: bool = Depends(require_supabase)
):
    """Get available split values for a source"""
    try:
        from supabase_client import get_split_values_for_source
        return await get_split_values_for_source(source_id, exclude_warehouse)
    except Exception as e:
        logger.error(f"Error getting split values: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Sheet Headers preview
@app_ext.get("/sheets/headers", response_model=HeaderPreviewResponse)
async def preview_headers(
    spreadsheet_id: str = Query(..., min_length=10),
    sheet_name: str = Query("Sheet1")
):
    """Preview headers from a Google Sheet"""
    try:
        # Fetch sheet values using service account credentials
        values = await fetch_sheet_values(spreadsheet_id, sheet_name, None)
        
        if not values:
            return HeaderPreviewResponse(
                headers=[],
                row_count=0,
                sample_rows=[]
            )
        
        headers = values[0] if values else []
        
        # Get sample rows (up to 5)
        sample_rows = []
        for row_values in values[1:6]:
            if row_values:
                row_dict = {}
                for i, header in enumerate(headers):
                    if i < len(row_values):
                        row_dict[header] = row_values[i]
                    else:
                        row_dict[header] = None
                sample_rows.append(row_dict)
        
        return HeaderPreviewResponse(
            headers=headers,
            row_count=len(values) - 1 if len(values) > 1 else 0,
            sample_rows=sample_rows
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error previewing headers: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Data Ingestion endpoint
@app_ext.post("/ingest", response_model=IngestResult)
async def ingest_data(
    request: IngestRequest,
    _: bool = Depends(require_supabase)
):
    """Ingest data from configured sources for a warehouse"""
    try:
        # Run ingestion using service account credentials
        result = await ingest_warehouse_data(
            warehouse_code=request.warehouse_code,
            types=request.types,
            dry_run=request.dry_run,
            batch_id=request.batch_id
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error during ingestion: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Bulk ingestion of all warehouses
class IngestAllRequest(BaseModel):
    types: List[str] = ['wms', 'sap']
    dry_run: bool = False

@app_ext.post("/ingest/all")
async def ingest_all(
    request: IngestAllRequest,
    _: bool = Depends(require_supabase)
):
    """
    Ingest ALL sheet sources directly from sheet_sources table.
    No warehouse binding required - processes every source independently.
    Clears wms_raw_rows and sap_raw_rows tables before inserting new data.
    """
    try:
        try:
            from ingest_new import ingest_source
        except ImportError:
            from ingest import ingest_source
        from supabase_client import supabase
        
        # Clear wms_raw_rows and sap_raw_rows tables before sync
        if not request.dry_run:
            try:
                logger.info("Clearing wms_raw_rows and sap_raw_rows tables...")
                
                # Clear WMS table if WMS type is requested
                if 'wms' in request.types:
                    supabase.table('wms_raw_rows').delete().not_.is_('id', None).execute()
                    logger.info("✅ wms_raw_rows table cleared")

                # Clear SAP table if SAP type is requested
                if 'sap' in request.types:
                    supabase.table('sap_raw_rows').delete().not_.is_('id', None).execute()
                    logger.info("✅ sap_raw_rows table cleared")
                    
                logger.info("All requested tables cleared successfully")
            except Exception as e:
                logger.error(f"Error clearing tables: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to clear tables: {str(e)}")
        
        # Note: warehouse_code column removed from tables, no mapping needed

        # Get all sheet sources from database
        all_sources = await get_sheet_sources()

        # Filter by requested types
        sources_to_process = [
            s for s in all_sources
            if s.get('type') in request.types
        ]

        total_sources = len(sources_to_process)
        total_rows_inserted = 0
        total_rows_updated = 0
        errors: List[Dict[str, Any]] = []

        batch_id = str(uuid.uuid4())

        # Process each source ONCE - get ALL data with split_key
        # Then let each warehouse filter by their split_key when reading
        for source in sources_to_process:
            source_id = source.get('id')
            source_type = source.get('type')
            source_label = source.get('label', 'Unnamed')

            try:
                logger.info(f"📥 Ingesting data from source: {source_label} ({source_type})")

                # Get ALL data from this source (no split filtering, no warehouse filtering)
                rows_processed, source_errors = await ingest_source(
                    source=source,
                    warehouse_code=None,  # No warehouse_code needed
                    batch_id=batch_id,
                    dry_run=request.dry_run,
                    split_value=None  # ✅ Get ALL splits, not filtered
                )
                
                total_rows_inserted += rows_processed
                
                if source_errors:
                    for err in source_errors:
                        errors.append({
                            "source_id": source_id,
                            "source_label": source_label,
                            "error": err
                        })
                        
            except Exception as e:
                logger.error(f"Error processing source {source_id} ({source_label}): {e}")
                errors.append({
                    "source_id": source_id,
                    "source_label": source_label,
                    "type": "processing_error",
                    "message": str(e)
                })
        
        return {
            "ok": len(errors) == 0,
            "message": f"Processed {total_sources} sources, inserted {total_rows_inserted} rows",
            "summary": {
                "sources_processed": total_sources,
                "rows_inserted": total_rows_inserted,
                "rows_updated": total_rows_updated,
                "errors": errors,
            }
        }
    except Exception as e:
        logger.error(f"Bulk ingestion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Snapshot building (stub for now)
@app_ext.post("/snapshot/build")
async def build_snapshot(
    warehouse_code: str,
    _: bool = Depends(require_supabase)
):
    """Build a snapshot from raw data (stub implementation)"""
    try:
        snapshot = await call_snapshot_function(warehouse_code)
        return {
            "message": "Snapshot building initiated",
            "warehouse_code": warehouse_code,
            "snapshot": snapshot
        }
    except Exception as e:
        logger.error(f"Error building snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Raw data retrieval
@app_ext.get("/raw/latest/{warehouse_code}")
async def get_raw_data(
    warehouse_code: str,
    source_type: Optional[str] = Query(None, regex="^(wms|sap)$"),
    limit: int = Query(50000, ge=1, le=1000000),  # 기본값을 50000으로 늘림
    use_snapshot: bool = Query(False, description="Use cached snapshot if available"),
    split_value: Optional[str] = Query(None, description="Filter by split value"),
    _: bool = Depends(require_supabase)
):
    """
    Get latest raw data for a warehouse using warehouse bindings.
    Uses pre-calculated inventory snapshots when available for better performance.
    Falls back to real-time data from wms_raw_rows/sap_raw_rows tables.
    """
    try:
        # Try to use inventory snapshot first
        if use_snapshot:
            try:
                from inventory_snapshot import get_inventory_snapshot_manager
                snapshot_manager = get_inventory_snapshot_manager()
                snapshot = snapshot_manager.get_inventory_snapshot(warehouse_code)

                if snapshot:
                    logger.info(f"Using inventory snapshot for {warehouse_code}")

                    # Filter by source_type if specified
                    wms_data = snapshot.get('wms_data', [])
                    sap_data = snapshot.get('sap_data', [])

                    if source_type == 'wms':
                        all_rows = wms_data
                    elif source_type == 'sap':
                        all_rows = sap_data
                    else:
                        all_rows = wms_data + sap_data

                    # Filter by split_value if specified
                    if split_value:
                        all_rows = [row for row in all_rows if row.get('split_key') == split_value]

                    # Apply limit
                    if len(all_rows) > limit:
                        all_rows = all_rows[:limit]

                    return {
                        "warehouse_code": warehouse_code,
                        "source_type": source_type,
                        "count": len(all_rows),
                        "rows": all_rows,
                        "from_snapshot": True,
                        "snapshot_updated": snapshot.get('last_updated')
                    }
            except Exception as e:
                logger.warning(f"Failed to load snapshot for {warehouse_code}, falling back to real-time: {e}")

        # Fallback to real-time data
        logger.info(f"Using real-time data for {warehouse_code}")
        from supabase_client import supabase

        # Get warehouse binding
        binding = await get_warehouse_binding(warehouse_code)

        if not binding or not binding.get('source_bindings'):
            logger.warning(f"No bindings found for warehouse {warehouse_code}")
            return {
                "warehouse_code": warehouse_code,
                "source_type": source_type,
                "count": 0,
                "rows": [],
                "from_snapshot": False
            }
        
        all_rows = []
        source_bindings = binding.get('source_bindings', {})
        
        for bind_key, binding_info in source_bindings.items():
            # Extract source_id and split_value from key
            if '::' in bind_key:
                source_id, split_value = bind_key.split('::', 1)
            else:
                source_id = bind_key
                split_value = binding_info.get('split_value')
            
            # Skip if source_type filter doesn't match
            bind_type = binding_info.get('type')
            if source_type and bind_type != source_type:
                continue
            
            # Select appropriate table based on type
            table_name = 'wms_raw_rows' if bind_type == 'wms' else 'sap_raw_rows'
            
            # Query appropriate table by source_id
            # All columns are direct PostgreSQL columns (no JSONB!)
            # Data is stored with warehouse_code='__GLOBAL__', filter by source_id and split_key
            query = supabase.table(table_name)\
                .select('*')\
                .eq('source_id', source_id)
            
            # Filter by split_value if specified
            if split_value:
                query = query.eq('split_key', split_value)
            
            # Try to get all data at once first (Supabase may have higher limits for simple queries)
            try:
                logger.info(f"Trying to fetch all data at once for source {source_id}, split: {split_value}")
                batch_result = query.limit(50000).execute()  # Try higher limit

                if batch_result.data:
                    logger.info(f"Successfully fetched {len(batch_result.data)} {bind_type.upper()} rows at once")

                    # 디버깅: 데이터의 zone 분포 확인
                    zone_counts = {}
                    for row in batch_result.data[:50]:  # 더 많은 샘플 확인
                        zone = row.get('zone_cd') or row.get('zone') or 'no_zone'
                        zone_counts[zone] = (zone_counts[zone] or 0) + 1
                    logger.info(f"Zone distribution in data: {zone_counts}")

                    # 전체 zone 분포
                    all_zone_counts = {}
                    for row in batch_result.data:
                        zone = row.get('zone_cd') or row.get('zone') or 'no_zone'
                        all_zone_counts[zone] = (all_zone_counts[zone] or 0) + 1
                    logger.info(f"Total zone distribution: {all_zone_counts}")

                    # Add source_type and override warehouse_code for display
                    for row in batch_result.data:
                        row['source_type'] = bind_type
                        row['warehouse_code'] = warehouse_code

                    all_rows.extend(batch_result.data)

            except Exception as e:
                logger.warning(f"Failed to fetch all at once ({str(e)}), falling back to pagination")
                # Fallback to pagination if limit is exceeded
                offset = 0
                batch_size = 5000  # Increased batch size for better performance

                while True:
                    batch_result = query.range(offset, offset + batch_size - 1).execute()

                    if not batch_result.data or len(batch_result.data) == 0:
                        break

                    # Add source_type and override warehouse_code for display
                    for row in batch_result.data:
                        row['source_type'] = bind_type
                        row['warehouse_code'] = warehouse_code

                    all_rows.extend(batch_result.data)
                    logger.info(f"Fetched {len(batch_result.data)} {bind_type.upper()} rows (paginated) for source {source_id}, offset: {offset}")

                    if len(batch_result.data) < batch_size:
                        break

                    offset += batch_size
            
            logger.info(f"Total {bind_type.upper()} rows fetched for source {source_id}: {len([r for r in all_rows if r.get('source_id') == source_id])}")
        
        # Save to snapshot cache for future queries (before applying limit)
        # This ensures the cache has full data even if this query has a limit
        if use_snapshot and all_rows:
            try:
                from inventory_snapshot import get_inventory_snapshot_manager
                from datetime import datetime
                
                # Separate WMS and SAP data for snapshot
                wms_data = [row for row in all_rows if row.get('source_type') == 'wms']
                sap_data = [row for row in all_rows if row.get('source_type') == 'sap']
                
                snapshot_manager = get_inventory_snapshot_manager()
                snapshot_data = {
                    'warehouse_code': warehouse_code,
                    'wms_data': wms_data,
                    'sap_data': sap_data,
                    'total_wms': len(wms_data),
                    'total_sap': len(sap_data),
                    'last_updated': datetime.utcnow().isoformat(),
                    'source_bindings': binding.get('source_bindings', {})
                }
                snapshot_manager._save_snapshot(warehouse_code, snapshot_data)
                logger.info(f"✅ Saved inventory snapshot for {warehouse_code}: {len(wms_data)} WMS + {len(sap_data)} SAP rows")
            except Exception as e:
                logger.warning(f"Failed to save snapshot for {warehouse_code}: {e}")
                # Continue even if snapshot save fails
        
        # Apply limit to total rows for response
        if len(all_rows) > limit:
            all_rows = all_rows[:limit]
            logger.warning(f"Truncated results to {limit} rows")
        
        return {
            "warehouse_code": warehouse_code,
            "source_type": source_type,
            "count": len(all_rows),
            "rows": all_rows,
            "from_snapshot": False
        }
    except Exception as e:
        logger.error(f"Error getting raw data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# Column Configuration Endpoints
# ============================================

@app_ext.get("/config/columns/{warehouse_code}")
async def get_column_config(warehouse_code: str):
    """Get column configuration for a warehouse"""
    try:
        config = load_column_config(warehouse_code)
        return config
    except Exception as e:
        logger.error(f"Error loading column config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app_ext.post("/config/columns/{warehouse_code}")
async def update_column_config(warehouse_code: str, config: Dict[str, Any]):
    """Update column configuration for a warehouse"""
    try:
        success = save_column_config(warehouse_code, config)
        if success:
            return {"ok": True, "message": "Column configuration saved successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to save column configuration")
    except Exception as e:
        logger.error(f"Error saving column config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app_ext.delete("/config/columns/{warehouse_code}")
async def reset_column_config_endpoint(warehouse_code: str):
    """Reset column configuration to defaults"""
    try:
        config = reset_column_config(warehouse_code)
        return {"ok": True, "message": "Column configuration reset to defaults", "config": config}
    except Exception as e:
        logger.error(f"Error resetting column config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app_ext.get("/config/columns")
async def list_column_configs():
    """List all warehouses with custom column configs"""
    try:
        configs = list_all_configs()
        return {"warehouses": configs}
    except Exception as e:
        logger.error(f"Error listing column configs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Location Inventory Endpoints
# ============================================

@app_ext.post("/location/inventory", response_model=LocationInventorySummary)
async def get_location_inventory_endpoint(
    request: LocationInventoryRequest,
    _: bool = Depends(require_supabase)
):
    """Get inventory for a specific location"""
    try:
        summary = await get_location_inventory(
            warehouse_code=request.warehouse_code,
            location=request.location
        )
        return summary
    except Exception as e:
        logger.error(f"Error fetching location inventory: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.post("/location/inventory/batch", response_model=Dict[str, LocationInventorySummary])
async def get_batch_location_inventory_endpoint(
    request: BatchLocationInventoryRequest,
    _: bool = Depends(require_supabase)
):
    """Get inventory for multiple locations"""
    try:
        result = await get_multiple_locations_inventory(
            warehouse_code=request.warehouse_code,
            locations=request.locations
        )
        return result
    except Exception as e:
        logger.error(f"Error fetching batch location inventory: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class RackInventoryRequest(BaseModel):
    warehouse_code: str
    rack_location: str


@app_ext.post("/location/rack-inventory", response_model=LocationInventorySummary)
async def get_rack_inventory_endpoint(
    request: RackInventoryRequest,
    _: None = Depends(require_supabase)
):
    """
    Get inventory for a rack by aggregating all locations matching the pattern
    E.g., rack_location="A03" will match "A03-01-01", "A03-02-03", etc.
    """
    try:
        logger.info(f"Fetching rack inventory for warehouse '{request.warehouse_code}', rack '{request.rack_location}'")
        summary = await get_rack_inventory(request.warehouse_code, request.rack_location)
        logger.info(f"Found {summary.total_items} items for rack '{request.rack_location}'")
        return summary
    except Exception as e:
        logger.error(f"Error fetching rack inventory: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Inventory Snapshot Management Endpoints
# ============================================

@app_ext.post("/inventory/snapshots/update")
async def update_inventory_snapshots(warehouse_codes: Optional[List[str]] = Query(None)):
    """
    Update inventory snapshots for specified warehouses.
    If no warehouse_codes provided, updates all warehouses with bindings.
    """
    logger.info(f"🔄 API: Updating inventory snapshots for: {warehouse_codes}")
    try:
        from inventory_snapshot import get_inventory_snapshot_manager
        manager = get_inventory_snapshot_manager()
        logger.info(f"   Calling update_all_inventory_snapshots...")
        await manager.update_all_inventory_snapshots(warehouse_codes)
        logger.info(f"   ✅ API: Inventory snapshots updated successfully")
        return {"ok": True, "message": "Inventory snapshots updated successfully"}
    except Exception as e:
        logger.error(f"Error updating inventory snapshots: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app_ext.get("/inventory/snapshots/{warehouse_code}")
async def get_inventory_snapshot(warehouse_code: str):
    """
    Get inventory snapshot for a specific warehouse.
    """
    try:
        from inventory_snapshot import get_inventory_snapshot_manager
        manager = get_inventory_snapshot_manager()
        snapshot = manager.get_inventory_snapshot(warehouse_code)

        if snapshot:
            return {
                "ok": True,
                "data": snapshot
            }
        else:
            return {
                "ok": False,
                "message": f"No snapshot found for warehouse {warehouse_code}"
            }
    except Exception as e:
        logger.error(f"Error getting inventory snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# Dashboard Cache Management Endpoints
# ============================================

@app_ext.get("/dashboard/inventory-stats")
async def get_dashboard_inventory_stats(warehouse_codes: List[str] = Query([])):
    """Get cached inventory statistics for dashboard"""
    try:
        from dashboard_cache import get_dashboard_cache_manager
        manager = get_dashboard_cache_manager()
        return await manager.get_inventory_stats(warehouse_codes)
    except Exception as e:
        logger.error(f"Error getting dashboard inventory stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app_ext.get("/dashboard/zone-utilization")
async def get_dashboard_zone_utilization(warehouse_codes: List[str] = Query([])):
    """Get cached zone utilization for dashboard"""
    try:
        from dashboard_cache import get_dashboard_cache_manager
        manager = get_dashboard_cache_manager()
        return await manager.get_zone_utilization(warehouse_codes)
    except Exception as e:
        logger.error(f"Error getting dashboard zone utilization: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app_ext.get("/dashboard/user-defined-zones")
async def get_dashboard_user_defined_zones(warehouse_codes: List[str] = Query([])):
    """Get cached user defined zones for dashboard heatmap"""
    try:
        from dashboard_cache import get_dashboard_cache_manager
        manager = get_dashboard_cache_manager()
        return await manager.get_user_defined_zones(warehouse_codes)
    except Exception as e:
        logger.error(f"Error getting dashboard user defined zones: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app_ext.get("/dashboard/expiring-items")
async def get_dashboard_expiring_items(warehouse_codes: List[str] = Query([]), days_ahead: int = Query(30)):
    """Get cached expiring items for dashboard"""
    try:
        from dashboard_cache import get_dashboard_cache_manager
        manager = get_dashboard_cache_manager()
        return await manager.get_expiring_items(warehouse_codes)
    except Exception as e:
        logger.error(f"Error getting dashboard expiring items: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app_ext.post("/dashboard/cache/clear")
async def clear_dashboard_cache(pattern: Optional[str] = Query(None)):
    """Clear dashboard cache files"""
    try:
        from dashboard_cache import get_dashboard_cache_manager
        manager = get_dashboard_cache_manager()
        manager.clear_cache(pattern)
        return {"ok": True, "message": "Dashboard cache cleared successfully"}
    except Exception as e:
        logger.error(f"Error clearing dashboard cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# Zone Capacity Management Endpoints
# ============================================

@app_ext.get("/zones/capacities", response_model=ZoneCapacityResponse)
async def get_zone_capacities(warehouse_codes: List[str] = Query([])):
    """
    Get zone capacity information for specified warehouses.
    If no warehouse_codes provided, returns all zones.
    """
    try:
        manager = get_zone_capacity_manager()
        return manager.get_zone_capacities(warehouse_codes)
    except Exception as e:
        logger.error(f"Error fetching zone capacities: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.post("/zones/capacities/update")
async def update_zone_capacities(warehouse_codes: Optional[List[str]] = Query(None)):
    """
    Update zone capacity information for specified warehouses.
    If no warehouse_codes provided, updates all zones.
    """
    try:
        manager = get_zone_capacity_manager()
        manager.update_zone_capacities(warehouse_codes)
        return {"ok": True, "message": "Zone capacities updated successfully"}
    except Exception as e:
        logger.error(f"Error updating zone capacities: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.post("/zones/capacities/sync")
async def sync_zone_current_quantities(
    warehouse_codes: Optional[List[str]] = Query(None),
    fast_mode: bool = Query(True, description="Use fast mode with pre-mapped materials")
):
    """
    Update current quantities in zones based on latest WMS data.
    If no warehouse_codes provided, syncs all zones.
    """
    try:
        manager = get_zone_capacity_manager()

        if fast_mode:
            # Fast mode: use pre-mapped materials information
            manager.update_current_quantities_fast(warehouse_codes)
            return {"ok": True, "message": "Zone current quantities synced (FAST mode)"}
        else:
            # Legacy mode: query WMS data in real-time
            manager.update_current_quantities(warehouse_codes)
            return {"ok": True, "message": "Zone current quantities synced (LEGACY mode)"}
    except Exception as e:
        logger.error(f"Error syncing zone quantities: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app_ext.get("/debug/wms-zones")
async def debug_wms_zones(limit: int = Query(50, description="Number of rows to check")):
    """Debug endpoint to check what zone values exist in WMS data"""
    try:
        try:
            from .supabase_client import supabase
        except ImportError:
            from supabase_client import supabase
        # Get WMS data (warehouse_code column removed)
        result = supabase.table('wms_raw_rows').select('*').limit(limit).execute()
        wms_data = result.data or []

        # Analyze zones - check all possible zone-related fields
        zones_found = set()
        locations_found = set()
        zone_details = []
        all_fields = set()

        # Collect all field names
        if wms_data:
            all_fields = set(wms_data[0].keys())

        for row in wms_data:
            # Check various possible zone field names
            zone_fields = ['zone', 'zone_cd', 'zone_code', 'warehouse_zone', 'storage_zone']
            location_fields = ['location', 'loc', 'location_code', 'storage_location']

            zone_value = ''
            location_value = ''

            # Find zone value
            for field in zone_fields:
                if row.get(field):
                    zone_value = str(row.get(field)).strip()
                    if zone_value:
                        zones_found.add(zone_value)
                        break

            # Find location value
            for field in location_fields:
                if row.get(field):
                    location_value = str(row.get(field)).strip()
                    if location_value:
                        locations_found.add(location_value)
                        break

            zone_details.append({
                'all_fields': list(all_fields),
                'zone_found': zone_value,
                'location_found': location_value,
                'item_code': str(row.get('item_code', '')).strip()
            })

        return {
            'total_rows_checked': len(wms_data),
            'unique_zones': sorted(list(zones_found)),
            'unique_locations': sorted(list(locations_found))[:20],  # First 20 locations
            'sample_data': zone_details[:10]
        }
    except Exception as e:
        logger.error(f"Error debugging WMS zones: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Materials Catalog Endpoints
class UpdateMaterialRequest(BaseModel):
    major_category: Optional[str] = None
    minor_category_id: Optional[str] = None  # UUID reference to minor_categories table


@app_ext.get("/materials")
async def list_materials(
    major_category: Optional[str] = Query(None),
    minor_category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    _: bool = Depends(require_supabase)
):
    """
    List materials with optional filtering.
    - major_category: Filter by major category
    - minor_category: Filter by minor category
    - search: Search in item_code or description
    - limit: Maximum number of results (default: 100)
    - offset: Number of results to skip (default: 0)
    """
    try:
        from supabase_client import supabase
        
        # Build query
        query = supabase.table('materials').select('*')
        
        # Apply filters
        if major_category:
            query = query.eq('major_category', major_category)
        
        if minor_category:
            query = query.eq('minor_category', minor_category)
        
        if search:
            # Search in item_code or description
            query = query.or_(f'item_code.ilike.%{search}%,description.ilike.%{search}%')
        
        # Apply pagination and ordering
        query = query.order('item_code', desc=False).range(offset, offset + limit - 1)
        
        result = query.execute()
        
        # Get total count for pagination
        count_query = supabase.table('materials').select('*', count='exact')
        if major_category:
            count_query = count_query.eq('major_category', major_category)
        if minor_category:
            count_query = count_query.eq('minor_category', minor_category)
        if search:
            count_query = count_query.or_(f'item_code.ilike.%{search}%,description.ilike.%{search}%')
        
        count_result = count_query.execute()
        total_count = count_result.count if hasattr(count_result, 'count') else len(count_result.data)
        
        return {
            "data": result.data,
            "total": total_count,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Error listing materials: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.get("/materials/{item_code}")
async def get_material(
    item_code: str,
    _: bool = Depends(require_supabase)
):
    """Get a single material by item code"""
    try:
        from supabase_client import supabase
        
        result = supabase.table('materials').select('*').eq('item_code', item_code).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail=f"Material {item_code} not found")
        
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting material {item_code}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.patch("/materials/{item_code}")
async def update_material(
    item_code: str,
    update: UpdateMaterialRequest,
    _: bool = Depends(require_supabase)
):
    """
    Update material classification.
    Only major_category and minor_category_id can be updated by users.
    """
    try:
        from supabase_client import supabase

        # Check if material exists
        existing = supabase.table('materials').select('*').eq('item_code', item_code).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail=f"Material {item_code} not found")

        # Prepare update data
        update_data = {}
        if update.major_category is not None:
            update_data['major_category'] = update.major_category
        if update.minor_category_id is not None:
            # Verify minor category exists if provided
            if update.minor_category_id:  # Allow empty string to clear
                minor = supabase.table('minor_categories').select('*').eq('id', update.minor_category_id).execute()
                if not minor.data:
                    raise HTTPException(status_code=404, detail="Minor category not found")
            update_data['minor_category_id'] = update.minor_category_id if update.minor_category_id else None

        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        update_data['updated_at'] = datetime.datetime.utcnow().isoformat()

        # Update material
        result = supabase.table('materials').update(update_data).eq('item_code', item_code).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update material")

        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating material {item_code}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.get("/materials/categories/major")
async def get_major_categories(_: bool = Depends(require_supabase)):
    """
    Get list of all major categories.
    Returns categories ordered by display_order.
    """
    try:
        from supabase_client import supabase
        
        # Get all major categories ordered by display_order
        result = supabase.table('major_categories').select('*').order('display_order').execute()
        
        return {
            "categories": result.data
        }
    except Exception as e:
        logger.error(f"Error getting major categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class CreateMajorCategoryRequest(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    display_order: Optional[int] = None


class UpdateMajorCategoryRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    display_order: Optional[int] = None


@app_ext.post("/materials/categories/major")
async def create_major_category(
    category: CreateMajorCategoryRequest,
    _: bool = Depends(require_supabase)
):
    """Create a new major category."""
    try:
        from supabase_client import supabase
        
        # Check if category already exists
        existing = supabase.table('major_categories').select('*').eq('name', category.name).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail=f"Category '{category.name}' already exists")
        
        # Create category
        data = {
            'name': category.name,
            'description': category.description,
            'color': category.color,
            'display_order': category.display_order or 0
        }
        
        result = supabase.table('major_categories').insert(data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create category")
        
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating major category: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.patch("/materials/categories/major/{category_id}")
async def update_major_category(
    category_id: str,
    update: UpdateMajorCategoryRequest,
    _: bool = Depends(require_supabase)
):
    """Update a major category."""
    try:
        from supabase_client import supabase
        
        # Check if category exists
        existing = supabase.table('major_categories').select('*').eq('id', category_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Category not found")
        
        # Prepare update data
        update_data = {}
        if update.name is not None:
            # Check if new name conflicts with existing category
            name_check = supabase.table('major_categories').select('*').eq('name', update.name).neq('id', category_id).execute()
            if name_check.data:
                raise HTTPException(status_code=400, detail=f"Category '{update.name}' already exists")
            update_data['name'] = update.name
        
        if update.description is not None:
            update_data['description'] = update.description
        if update.color is not None:
            update_data['color'] = update.color
        if update.display_order is not None:
            update_data['display_order'] = update.display_order
        
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        update_data['updated_at'] = datetime.datetime.utcnow().isoformat()
        
        # Update category
        result = supabase.table('major_categories').update(update_data).eq('id', category_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update category")
        
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating major category: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.delete("/materials/categories/major/{category_id}")
async def delete_major_category(
    category_id: str,
    _: bool = Depends(require_supabase)
):
    """
    Delete a major category.
    Note: This will set materials using this category to NULL.
    """
    try:
        from supabase_client import supabase
        
        # Check if category exists
        existing = supabase.table('major_categories').select('*').eq('id', category_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Category not found")
        
        category_name = existing.data[0]['name']
        
        # Update materials using this category to NULL
        supabase.table('materials').update({'major_category': None}).eq('major_category', category_name).execute()
        
        # Delete category
        result = supabase.table('major_categories').delete().eq('id', category_id).execute()
        
        return {
            "ok": True,
            "message": f"Category '{category_name}' deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting major category: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# MINOR CATEGORIES API
# ============================================

@app_ext.get("/materials/categories/minor")
async def get_minor_categories(_: bool = Depends(require_supabase)):
    """
    Get list of all minor categories with their major category information.
    Returns categories ordered by major category and display_order.
    """
    try:
        from supabase_client import supabase

        # Get all minor categories with major category info
        result = supabase.table('minor_categories')\
            .select('*, major_category:major_categories(id, name, color)')\
            .order('display_order')\
            .execute()

        return {
            "categories": result.data
        }
    except Exception as e:
        logger.error(f"Error getting minor categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.get("/materials/categories/major/{major_id}/minors")
async def get_minor_categories_by_major(
    major_id: str,
    _: bool = Depends(require_supabase)
):
    """
    Get all minor categories for a specific major category.
    Returns categories ordered by display_order.
    """
    try:
        from supabase_client import supabase

        # Check if major category exists
        major = supabase.table('major_categories').select('*').eq('id', major_id).execute()
        if not major.data:
            raise HTTPException(status_code=404, detail="Major category not found")

        # Get minor categories for this major category
        result = supabase.table('minor_categories')\
            .select('*')\
            .eq('major_category_id', major_id)\
            .order('display_order')\
            .execute()

        return {
            "major_category": major.data[0],
            "minor_categories": result.data
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting minor categories for major {major_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class CreateMinorCategoryRequest(BaseModel):
    name: str
    major_category_id: str
    description: Optional[str] = None
    display_order: Optional[int] = None


class UpdateMinorCategoryRequest(BaseModel):
    name: Optional[str] = None
    major_category_id: Optional[str] = None
    description: Optional[str] = None
    display_order: Optional[int] = None


@app_ext.post("/materials/categories/minor")
async def create_minor_category(
    category: CreateMinorCategoryRequest,
    _: bool = Depends(require_supabase)
):
    """Create a new minor category under a major category."""
    try:
        from supabase_client import supabase

        # Check if major category exists
        major = supabase.table('major_categories').select('*').eq('id', category.major_category_id).execute()
        if not major.data:
            raise HTTPException(status_code=404, detail="Major category not found")

        # Check if minor category already exists for this major category
        existing = supabase.table('minor_categories')\
            .select('*')\
            .eq('name', category.name)\
            .eq('major_category_id', category.major_category_id)\
            .execute()
        if existing.data:
            raise HTTPException(
                status_code=400,
                detail=f"Minor category '{category.name}' already exists for this major category"
            )

        # Create minor category
        data = {
            'name': category.name,
            'major_category_id': category.major_category_id,
            'description': category.description,
            'display_order': category.display_order or 0
        }

        result = supabase.table('minor_categories').insert(data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create minor category")

        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating minor category: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.patch("/materials/categories/minor/{category_id}")
async def update_minor_category(
    category_id: str,
    update: UpdateMinorCategoryRequest,
    _: bool = Depends(require_supabase)
):
    """Update a minor category."""
    try:
        from supabase_client import supabase

        # Check if category exists
        existing = supabase.table('minor_categories').select('*').eq('id', category_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Minor category not found")

        # Prepare update data
        update_data = {}

        if update.name is not None:
            # Check if new name conflicts with existing category in same major category
            major_id = update.major_category_id if update.major_category_id else existing.data[0]['major_category_id']
            name_check = supabase.table('minor_categories')\
                .select('*')\
                .eq('name', update.name)\
                .eq('major_category_id', major_id)\
                .neq('id', category_id)\
                .execute()
            if name_check.data:
                raise HTTPException(
                    status_code=400,
                    detail=f"Minor category '{update.name}' already exists for this major category"
                )
            update_data['name'] = update.name

        if update.major_category_id is not None:
            # Verify new major category exists
            major = supabase.table('major_categories').select('*').eq('id', update.major_category_id).execute()
            if not major.data:
                raise HTTPException(status_code=404, detail="Major category not found")
            update_data['major_category_id'] = update.major_category_id

        if update.description is not None:
            update_data['description'] = update.description
        if update.display_order is not None:
            update_data['display_order'] = update.display_order

        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        update_data['updated_at'] = datetime.datetime.utcnow().isoformat()

        # Update category
        result = supabase.table('minor_categories').update(update_data).eq('id', category_id).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update minor category")

        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating minor category: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.delete("/materials/categories/minor/{category_id}")
async def delete_minor_category(
    category_id: str,
    _: bool = Depends(require_supabase)
):
    """
    Delete a minor category.
    Note: This will set materials using this category to NULL.
    """
    try:
        from supabase_client import supabase

        # Check if category exists
        existing = supabase.table('minor_categories').select('*').eq('id', category_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Minor category not found")

        category_name = existing.data[0]['name']

        # Update materials using this category to NULL
        supabase.table('materials').update({'minor_category_id': None}).eq('minor_category_id', category_id).execute()

        # Delete category (CASCADE will handle this, but explicit is better)
        result = supabase.table('minor_categories').delete().eq('id', category_id).execute()

        return {
            "ok": True,
            "message": f"Minor category '{category_name}' deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting minor category: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# FACTORY API
# ============================================

@app_ext.get("/factories", response_model=FactoryListResponse)
async def get_factories_endpoint():
    """Get all factories with production line counts"""
    try:
        factories = await get_factories()
        return FactoryListResponse(
            factories=[FactoryExtended(**f) for f in factories],
            total_count=len(factories)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting factories: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.get("/factories/{factory_id}", response_model=FactoryResponse)
async def get_factory_endpoint(factory_id: str):
    """Get a single factory by ID"""
    try:
        factory = await get_factory(factory_id)
        if not factory:
            raise HTTPException(status_code=404, detail="Factory not found")
        return FactoryResponse(factory=FactoryExtended(**factory))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting factory: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.post("/factories", response_model=FactoryResponse)
async def create_factory_endpoint(request: FactoryCreateRequest):
    """Create a new factory"""
    try:
        # Check if code already exists
        existing = supabase.table('factories').select('id').eq('code', request.code).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail=f"Factory code '{request.code}' already exists")

        factory_data = request.dict()
        factory = await create_factory(factory_data)
        return FactoryResponse(factory=FactoryExtended(**factory))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating factory: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.put("/factories/{factory_id}", response_model=FactoryResponse)
async def update_factory_endpoint(factory_id: str, request: FactoryUpdateRequest):
    """Update a factory"""
    try:
        # Check if factory exists
        existing = await get_factory(factory_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Factory not found")

        # If updating code, check for duplicates
        if request.code and request.code != existing['code']:
            duplicate = supabase.table('factories').select('id').eq('code', request.code).execute()
            if duplicate.data:
                raise HTTPException(status_code=400, detail=f"Factory code '{request.code}' already exists")

        update_data = {k: v for k, v in request.dict().items() if v is not None}
        factory = await update_factory(factory_id, update_data)
        return FactoryResponse(factory=FactoryExtended(**factory))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating factory: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.delete("/factories/{factory_id}")
async def delete_factory_endpoint(factory_id: str):
    """Delete a factory (cascade deletes production lines)"""
    try:
        # Check if factory exists
        existing = await get_factory(factory_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Factory not found")

        success = await delete_factory(factory_id)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete factory")

        return {"message": "Factory deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting factory: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.get("/factories/{factory_id}/production-lines", response_model=ProductionLineListResponse)
async def get_factory_production_lines(factory_id: str):
    """Get production lines for a specific factory"""
    try:
        # Check if factory exists
        existing = await get_factory(factory_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Factory not found")

        lines = await get_production_lines(factory_id)
        return ProductionLineListResponse(
            production_lines=[ProductionLineExtended(**line) for line in lines],
            total_count=len(lines)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting factory production lines: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# PRODUCTION LINES API
# ============================================

@app_ext.get("/production-lines", response_model=ProductionLineListResponse)
async def get_all_production_lines_endpoint(factory_id: Optional[str] = Query(None)):
    """Get all production lines, optionally filtered by factory"""
    try:
        lines = await get_production_lines(factory_id)
        return ProductionLineListResponse(
            production_lines=[ProductionLineExtended(**line) for line in lines],
            total_count=len(lines)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting production lines: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.post("/production-lines", response_model=ProductionLineResponse)
async def create_production_line_endpoint(request: ProductionLineCreateRequest):
    """Create a new production line (must belong to a factory)"""
    try:
        # Validate factory exists
        factory = await get_factory(request.factory_id)
        if not factory:
            raise HTTPException(status_code=404, detail=f"Factory {request.factory_id} not found")

        line_data = request.dict()
        line = await create_production_line(line_data)

        return ProductionLineResponse(production_line=ProductionLineExtended(**line))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating production line: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.put("/production-lines/{line_id}", response_model=ProductionLineResponse)
async def update_production_line_endpoint(line_id: str, request: ProductionLineUpdateRequest):
    """Update a production line"""
    try:
        # Check if line exists
        existing_result = supabase.table('production_lines').select('id').eq('id', line_id).execute()
        if not existing_result.data:
            raise HTTPException(status_code=404, detail="Production line not found")

        # If updating factory_id, validate factory exists
        if request.factory_id:
            factory = await get_factory(request.factory_id)
            if not factory:
                raise HTTPException(status_code=404, detail=f"Factory {request.factory_id} not found")

        update_data = {k: v for k, v in request.dict().items() if v is not None}
        line = await update_production_line(line_id, update_data)

        return ProductionLineResponse(production_line=ProductionLineExtended(**line))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating production line: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app_ext.delete("/production-lines/{line_id}")
async def delete_production_line_endpoint(line_id: str):
    """Delete a production line"""
    try:
        # Check if line exists
        existing_result = supabase.table('production_lines').select('id').eq('id', line_id).execute()
        if not existing_result.data:
            raise HTTPException(status_code=404, detail="Production line not found")

        success = await delete_production_line(line_id)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete production line")

        return {"message": "Production line deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting production line: {e}")
        raise HTTPException(status_code=500, detail=str(e))
