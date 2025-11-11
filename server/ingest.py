"""Data ingestion logic for processing Google Sheets data"""
import asyncio
import uuid
from datetime import datetime, date
from typing import Dict, List, Any, Optional, Tuple
import logging

from sheets import fetch_sheet_values, normalize
from models_extended import (
    SheetSource, 
    ClassificationConfig,
    RawRow,
    IngestResult
)
from supabase_client import (
    get_sheet_sources,
    get_warehouse_binding,
    insert_raw_rows,
    supabase
)

logger = logging.getLogger(__name__)

def extract_denormalized_fields(
    row: Dict[str, Any],
    source_type: str,
    classification: ClassificationConfig
) -> Dict[str, Any]:
    """Extract denormalized fields based on source type and classification"""
    denorm = {
        'zone': None,
        'location': None,
        'item_code': None,
        'lot_key': None,
        'split_key': None
    }

    # Extract item code (common for both types)
    if classification.item_col and classification.item_col in row:
        value = str(row[classification.item_col]).strip() if row[classification.item_col] else None
        denorm['item_code'] = value if value else None

    # Extract lot key (single lot column)
    if classification.lot_col and classification.lot_col in row:
        value = str(row[classification.lot_col]).strip() if row[classification.lot_col] else None
        denorm['lot_key'] = value if value else None

    # Extract split_key (common for both WMS and SAP)
    if classification.split_enabled and classification.split_by_column:
        if classification.split_by_column in row:
            value = str(row[classification.split_by_column]).strip() if row[classification.split_by_column] else None
            denorm['split_key'] = value if value else None
    
    if source_type == 'wms':
        # WMS specific fields
        if classification.zone_col and classification.zone_col in row:
            value = str(row[classification.zone_col]).strip() if row[classification.zone_col] else None
            denorm['zone'] = value if value else None

        if classification.location_col and classification.location_col in row:
            value = str(row[classification.location_col]).strip() if row[classification.location_col] else None
            denorm['location'] = value if value else None

    elif source_type == 'sap':
        # SAP specific fields
        if classification.source_location_col and classification.source_location_col in row:
            value = str(row[classification.source_location_col]).strip() if row[classification.source_location_col] else None
            denorm['source_location'] = value if value else None

    return denorm

def extract_quantities(row: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
    """Extract available and total quantities from row"""
    available_qty = None
    total_qty = None
    
    # Common quantity column names (case-insensitive)
    avail_keys = ['Available Qty.', 'Available Qty', 'Avail Qty', 'available_qty']
    total_keys = ['Tot. Qty.', 'Total Qty.', 'Total Qty', 'tot_qty', 'total_qty']
    
    for key in avail_keys:
        if key in row and row[key] is not None:
            try:
                available_qty = float(row[key])
                break
            except (ValueError, TypeError):
                pass
    
    for key in total_keys:
        if key in row and row[key] is not None:
            try:
                total_qty = float(row[key])
                break
            except (ValueError, TypeError):
                pass
    
    return available_qty, total_qty

def extract_dates(row: Dict[str, Any]) -> Dict[str, Optional[date]]:
    """Extract date fields from row"""
    dates = {
        'inb_date': None,
        'valid_date': None,
        'prod_date': None
    }
    
    # Date column mappings
    date_mappings = {
        'inb_date': ['Inb. Date', 'Inbound Date', 'inb_date'],
        'valid_date': ['Valid Date', 'Valid Until', 'valid_date'],
        'prod_date': ['Prod. Date', 'Production Date', 'prod_date']
    }
    
    for field, possible_keys in date_mappings.items():
        for key in possible_keys:
            if key in row and row[key]:
                # The value should already be ISO format from normalization
                try:
                    if isinstance(row[key], str):
                        # Parse ISO date string
                        dates[field] = datetime.fromisoformat(row[key]).date()
                    elif isinstance(row[key], date):
                        dates[field] = row[key]
                except (ValueError, TypeError):
                    pass
                if dates[field]:
                    break
    
    return dates

async def ingest_source(
    source: Dict[str, Any],
    warehouse_code: Optional[str],
    batch_id: str,
    dry_run: bool = False,
    split_value: Optional[str] = None
) -> Tuple[int, List[str]]:
    """
    Ingest data from a single source.
    
    Args:
        split_value: If provided, only ingest rows where split_key matches this value.
    
    If warehouse_code is None and split is enabled:
      - Uses split_key as warehouse_code
    If warehouse_code is None and split is NOT enabled:
      - Skips warehouse_code (leaves as NULL)
    """
    errors = []
    rows_processed = 0
    
    try:
        # Fetch sheet data
        values = await fetch_sheet_values(
            source['spreadsheet_id'],
            source['sheet_name'],
            None
        )
        
        if not values or len(values) < 2:
            errors.append(f"Source {source['label']}: No data found")
            return 0, errors
        
        # Get header and normalize rows
        header = values[0]
        normalized_rows = normalize(values)
        
        if not normalized_rows:
            errors.append(f"Source {source['label']}: No valid rows after normalization")
            return 0, errors
        
        # Parse classification config
        classification = ClassificationConfig(**source.get('classification', {}))
        
        # Check if split is enabled
        split_enabled = classification.split_enabled and classification.split_by_column
        
        # Prepare raw rows for insertion
        raw_rows_to_insert = []
        
        for norm_row in normalized_rows:
            # Extract denormalized fields
            denorm = extract_denormalized_fields(
                norm_row,
                source['type'],
                classification
            )
            
            # Skip rows without item code
            if not denorm['item_code']:
                continue
            
            # Filter by split_value if specified
            if split_value and denorm['split_key'] != split_value:
                continue
            
            # Extract quantities and dates
            available_qty, total_qty = extract_quantities(norm_row)
            dates = extract_dates(norm_row)

            # Create raw row
            raw_row = {
                'source_id': source['id'],
                'source_type': source['type'],
                'header': header,
                'row': norm_row,
                'zone': denorm['zone'],
                'location': denorm['location'],
                'item_code': denorm['item_code'],
                'lot_key': denorm['lot_key'],
                'split_key': denorm['split_key'],
                'available_qty': available_qty,
                'total_qty': total_qty,
                'inb_date': dates['inb_date'].isoformat() if dates['inb_date'] else None,
                'valid_date': dates['valid_date'].isoformat() if dates['valid_date'] else None,
                'prod_date': dates['prod_date'].isoformat() if dates['prod_date'] else None,
                'batch_id': batch_id,
                'fetched_at': datetime.utcnow().isoformat()
            }
            
            raw_rows_to_insert.append(raw_row)
        
        if not dry_run and raw_rows_to_insert:
            # Insert rows into database
            rows_processed = await insert_raw_rows(raw_rows_to_insert)
            logger.info(f"Inserted {rows_processed} rows from source {source['label']}")
        else:
            rows_processed = len(raw_rows_to_insert)
            logger.info(f"Dry run: Would insert {rows_processed} rows from source {source['label']}")
        
    except Exception as e:
        error_msg = f"Source {source['label']}: {str(e)}"
        errors.append(error_msg)
        logger.error(error_msg)
    
    return rows_processed, errors

async def ingest_warehouse_data(
    warehouse_code: str,
    types: List[str],
    dry_run: bool = False,
    batch_id: Optional[str] = None
) -> IngestResult:
    """Ingest data for a warehouse from all configured sources"""
    start_time = datetime.utcnow()
    
    if not batch_id:
        batch_id = str(uuid.uuid4())
    
    result = IngestResult(
        warehouse_code=warehouse_code,
        batch_id=batch_id
    )
    
    try:
        # Get warehouse binding
        binding = await get_warehouse_binding(warehouse_code)
        if not binding:
            result.errors.append({
                'type': 'binding_error',
                'message': f'No binding found for warehouse {warehouse_code}'
            })
            return result
        
        # Collect source bindings to process
        # New format: source_bindings = { "source_id" or "source_id::split_value": { type, split_value } }
        source_bindings_to_process = []
        source_bindings = binding.get('source_bindings', {})
        
        for bind_key, binding_info in source_bindings.items():
            # Extract source_id and split_value from key
            if '::' in bind_key:
                source_id, split_value = bind_key.split('::', 1)
            else:
                source_id = bind_key
                split_value = binding_info.get('split_value')
            
            # Check if type matches requested types
            if binding_info.get('type') in types:
                source_bindings_to_process.append({
                    'source_id': source_id,
                    'split_value': split_value,
                    'type': binding_info.get('type')
                })
        
        # Fallback to old format for backward compatibility
        if not source_bindings_to_process:
            source_ids_to_process = []
            if 'wms' in types and binding.get('wms_source_ids'):
                for sid in binding['wms_source_ids']:
                    source_bindings_to_process.append({'source_id': sid, 'split_value': None, 'type': 'wms'})
            
            if 'sap' in types and binding.get('sap_source_ids'):
                for sid in binding['sap_source_ids']:
                    source_bindings_to_process.append({'source_id': sid, 'split_value': None, 'type': 'sap'})
        
        if not source_bindings_to_process:
            result.warnings.append(f'No sources configured for types: {types}')
            return result
        
        # Extract unique source IDs for database query
        source_ids_to_process = list(set(b['source_id'] for b in source_bindings_to_process))
        
        # Get source details from database
        if not supabase:
            result.errors.append({
                'type': 'database_error',
                'message': 'Supabase not configured'
            })
            return result
        
        # Fetch all sources
        sources_result = supabase.table('sheet_sources').select('*').in_('id', source_ids_to_process).execute()
        sources = sources_result.data if sources_result else []
        
        # Create a map of source_id -> source
        source_map = {s['id']: s for s in sources}
        
        # Process each source-split binding
        tasks = []
        for binding in source_bindings_to_process:
            source_id = binding['source_id']
            split_value = binding.get('split_value')
            
            source = source_map.get(source_id)
            if not source:
                result.warnings.append(f'Source {source_id} not found in database')
                continue
            
            if source['type'] not in types:
                continue
            
            task = ingest_source(
                source,
                warehouse_code,
                batch_id,
                dry_run,
                split_value=split_value  # Pass split_value to filter data
            )
            tasks.append(task)
        
        # Run all ingestion tasks concurrently
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for i, (task_result) in enumerate(results):
                if isinstance(task_result, Exception):
                    result.errors.append({
                        'type': 'task_error',
                        'message': str(task_result)
                    })
                else:
                    rows_count, errors = task_result
                    result.rows_inserted += rows_count
                    for error in errors:
                        result.errors.append({
                            'type': 'source_error',
                            'message': error
                        })
        
        result.sources_processed = len(sources)
        
    except Exception as e:
        result.errors.append({
            'type': 'general_error',
            'message': str(e)
        })
    
    # Calculate duration
    result.duration_seconds = (datetime.utcnow() - start_time).total_seconds()
    
    return result
