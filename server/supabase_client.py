"""Supabase client configuration and helpers"""
import os
from supabase import create_client, Client
from typing import Optional, Dict, Any, List
import logging
from dotenv import load_dotenv, find_dotenv
from pathlib import Path

logger = logging.getLogger(__name__)

# Load env from server/.env first (if present), then fall back to nearest .env up the tree
server_dotenv = Path(__file__).resolve().parent / '.env'
if server_dotenv.exists():
    load_dotenv(server_dotenv, override=False)
load_dotenv(find_dotenv(), override=False)

# Get Supabase credentials from environment
SUPABASE_URL = os.getenv('SUPABASE_URL', '')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY', '')  # Use service key for server-side operations

# Initialize Supabase client
supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    logger.info("Supabase client initialized")
else:
    logger.warning("Supabase credentials not found. Database operations will fail.")

def check_supabase() -> bool:
    """Check if Supabase is configured"""
    return supabase is not None

async def get_sheet_sources(source_type: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get sheet sources from database"""
    if not supabase:
        raise Exception("Supabase not configured")
    
    query = supabase.table('sheet_sources').select('*')
    if source_type:
        query = query.eq('type', source_type)
    
    result = query.order('created_at', desc=True).execute()
    return result.data if result else []

async def create_sheet_source(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new sheet source"""
    if not supabase:
        raise Exception("Supabase not configured")
    
    result = supabase.table('sheet_sources').insert(data).execute()
    return result.data[0] if result.data else {}

async def update_sheet_source(source_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Update an existing sheet source"""
    if not supabase:
        raise Exception("Supabase not configured")
    
    result = supabase.table('sheet_sources').update(data).eq('id', source_id).execute()
    return result.data[0] if result.data else {}

async def delete_sheet_source(source_id: str) -> bool:
    """Delete a sheet source"""
    if not supabase:
        raise Exception("Supabase not configured")
    
    result = supabase.table('sheet_sources').delete().eq('id', source_id).execute()
    return len(result.data) > 0 if result.data else False

async def get_warehouse_id_by_code(warehouse_code: str) -> Optional[str]:
    """Get warehouse ID by code"""
    if not supabase:
        raise Exception("Supabase not configured")
    
    result = supabase.table('warehouses').select('id').eq('code', warehouse_code).execute()
    return result.data[0]['id'] if result.data else None

async def get_warehouse_binding(warehouse_code: str) -> Optional[Dict[str, Any]]:
    """Get warehouse binding by code"""
    if not supabase:
        raise Exception("Supabase not configured")
    
    # Get warehouse_id from code
    warehouse_id = await get_warehouse_id_by_code(warehouse_code)
    if not warehouse_id:
        return None
    
    # Query by warehouse_id
    result = supabase.table('warehouse_bindings')\
        .select('*, warehouses!inner(code)')\
        .eq('warehouse_id', warehouse_id)\
        .execute()
    
    if result.data:
        binding = result.data[0]
        # Add warehouse_code for backward compatibility
        binding['warehouse_code'] = binding['warehouses']['code']
        del binding['warehouses']
        return binding
    return None

async def upsert_warehouse_binding(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create or update warehouse binding"""
    if not supabase:
        raise Exception("Supabase not configured")
    
    # Extract warehouse_code and convert to warehouse_id
    warehouse_code = data.pop('warehouse_code', None)
    if not warehouse_code:
        raise Exception("warehouse_code is required")
    
    warehouse_id = await get_warehouse_id_by_code(warehouse_code)
    if not warehouse_id:
        raise Exception(f"Warehouse with code {warehouse_code} not found")
    
    # Replace warehouse_code with warehouse_id
    data['warehouse_id'] = warehouse_id
    
    # Use upsert with on_conflict on warehouse_id
    result = supabase.table('warehouse_bindings').upsert(
        data, 
        on_conflict='warehouse_id'
    ).execute()
    
    # Return the first item if data exists
    if result.data and len(result.data) > 0:
        binding = result.data[0]
        # Add warehouse_code for backward compatibility
        binding['warehouse_code'] = warehouse_code
        return binding
    return {}

async def insert_raw_rows(rows: List[Dict[str, Any]]) -> int:
    """Insert raw rows into database"""
    if not supabase:
        raise Exception("Supabase not configured")
    
    if not rows:
        return 0
    
    # Insert in batches of 1000
    batch_size = 1000
    total_inserted = 0
    
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            result = supabase.table('raw_rows').insert(batch).execute()
            total_inserted += len(result.data) if result.data else 0
        except Exception as e:
            logger.error(f"Error inserting batch {i//batch_size + 1}: {e}")
            # Continue with next batch
    
    return total_inserted

async def get_latest_raw_data(
    warehouse_code: str, 
    source_type: Optional[str] = None,
    limit: int = 1000
) -> List[Dict[str, Any]]:
    """Get latest raw data for a warehouse"""
    if not supabase:
        raise Exception("Supabase not configured")
    
    query = supabase.table('raw_rows').select('*').eq('warehouse_code', warehouse_code)
    
    if source_type:
        query = query.eq('source_type', source_type)
    
    result = query.order('fetched_at', desc=True).limit(limit).execute()
    return result.data if result else []

async def call_snapshot_function(warehouse_code: str) -> Dict[str, Any]:
    """Call the database function to build a snapshot"""
    if not supabase:
        raise Exception("Supabase not configured")
    
    result = supabase.rpc('build_snapshot_from_raw', {'p_warehouse_code': warehouse_code}).execute()
    return result.data if result else {}

# ---------------------------------------------
# Warehouse bindings helpers (list / delete)
# ---------------------------------------------

async def list_warehouse_bindings() -> List[Dict[str, Any]]:
    """List all warehouse bindings."""
    if not supabase:
        raise Exception("Supabase not configured")
    
    # Join with warehouses to get warehouse_code
    result = supabase.table('warehouse_bindings')\
        .select('*, warehouses!inner(code)')\
        .order('created_at', desc=True)\
        .execute()
    
    if result.data:
        # Add warehouse_code for backward compatibility
        bindings = []
        for binding in result.data:
            binding['warehouse_code'] = binding['warehouses']['code']
            del binding['warehouses']
            bindings.append(binding)
        return bindings
    return []

async def delete_warehouse_binding(warehouse_code: str) -> bool:
    """Delete a warehouse binding by code."""
    if not supabase:
        raise Exception("Supabase not configured")
    
    # Get warehouse_id from code
    warehouse_id = await get_warehouse_id_by_code(warehouse_code)
    if not warehouse_id:
        return False
    
    result = supabase.table('warehouse_bindings').delete().eq('warehouse_id', warehouse_id).execute()
    return len(result.data) > 0 if result.data else False

async def get_split_values_for_source(source_id: str, exclude_warehouse: Optional[str] = None) -> Dict[str, Any]:
    """
    Get available split values for a source.
    Returns the split column name and list of values with availability status.
    """
    if not supabase:
        raise Exception("Supabase not configured")
    
    # Get the source to check if it has split enabled
    source_result = supabase.table('sheet_sources').select('*').eq('id', source_id).execute()
    if not source_result.data:
        return {
            'source_id': source_id,
            'split_by_column': None,
            'values': []
        }
    
    source = source_result.data[0]
    classification = source.get('classification', {})
    split_enabled = classification.get('split_enabled', False)
    split_by_column = classification.get('split_by_column')
    
    if not split_enabled or not split_by_column:
        return {
            'source_id': source_id,
            'split_by_column': None,
            'values': []
        }
    
    # Get unique split_key values from appropriate table based on source type
    source_type = source.get('type')
    table_name = 'wms_raw_rows' if source_type == 'wms' else 'sap_raw_rows'
    
    try:
        # First, let's check total count
        count_result = supabase.table(table_name)\
            .select('id', count='exact')\
            .eq('source_id', source_id)\
            .execute()
        
        logger.info(f"Total rows in {table_name} for source {source_id}: {count_result.count if hasattr(count_result, 'count') else 'unknown'}")
        
        # Get all split_key values (limit to reasonable number)
        raw_result = supabase.table(table_name)\
            .select('split_key')\
            .eq('source_id', source_id)\
            .limit(10000)\
            .execute()
        
        logger.info(f"Raw query result for source {source_id}: {len(raw_result.data) if raw_result.data else 0} rows fetched")
    except Exception as e:
        logger.error(f"Error querying {table_name}: {e}")
        raw_result = None
    
    # Collect unique values (filter out null/empty)
    unique_values = set()
    all_split_keys = []  # For debugging
    
    if raw_result and raw_result.data:
        for idx, row in enumerate(raw_result.data):
            split_key = row.get('split_key')
            all_split_keys.append(split_key)
            
            # Log first 10 for debugging
            if idx < 10:
                logger.info(f"  Row {idx}: split_key = '{split_key}' (type: {type(split_key)})")
            
            if split_key and split_key.strip():  # Filter out null and empty strings
                unique_values.add(split_key.strip())
        
        logger.info(f"Total rows: {len(raw_result.data)}, Non-null split_keys: {len([k for k in all_split_keys if k])}")
        logger.info(f"Found {len(unique_values)} unique split values for source {source_id}: {sorted(unique_values)}")
    
    # Get all warehouse bindings to check which split values are in use
    # Join with warehouses to get warehouse_code
    bindings_result = supabase.table('warehouse_bindings')\
        .select('*, warehouses!inner(code)')\
        .execute()
    
    # Build a map of split_value -> warehouse_code
    split_usage = {}  # {split_value: warehouse_code}
    if bindings_result.data:
        for binding in bindings_result.data:
            warehouse_code = binding['warehouses']['code']
            source_bindings = binding.get('source_bindings')
            
            # Skip if this is the warehouse being edited
            if exclude_warehouse and warehouse_code == exclude_warehouse:
                continue
            
            # Check if this binding uses our source_id
            # Key format: "source_id" or "source_id::split_value"
            if source_bindings and isinstance(source_bindings, dict):
                for bind_key, binding_info in source_bindings.items():
                    # Extract source_id from key
                    bind_source_id = bind_key.split('::')[0] if '::' in bind_key else bind_key
                    
                    if bind_source_id == source_id:
                        # Extract split_value from key if present
                        split_value = bind_key.split('::')[1] if '::' in bind_key else binding_info.get('split_value')
                        if split_value:
                            split_usage[split_value] = warehouse_code
    
    # Build response
    values = []
    for value in sorted(unique_values):
        warehouse_using_it = split_usage.get(value)
        values.append({
            'value': value,
            'warehouse_code': warehouse_using_it,
            'is_available': warehouse_using_it is None
        })
    
    return {
        'source_id': source_id,
        'split_by_column': split_by_column,
        'values': values
    }

# ============================================
# PRODUCTION LINES FUNCTIONS
# ============================================

async def get_production_lines(warehouse_id: str) -> List[Dict[str, Any]]:
    """Get all production lines for a warehouse with their materials"""
    if not supabase:
        raise Exception("Supabase not configured")

    # Get production lines
    lines_result = supabase.table('production_lines').select('*').eq('warehouse_id', warehouse_id).execute()

    if not lines_result.data:
        return []

    lines = []
    for line in lines_result.data:
        # Get materials for this line
        materials_result = supabase.table('production_line_materials').select('*').eq('production_line_id', line['id']).execute()

        line['materials'] = materials_result.data if materials_result.data else []
        lines.append(line)

    return lines

async def create_production_line(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new production line with materials"""
    if not supabase:
        raise Exception("Supabase not configured")

    # Extract materials from data
    materials = data.pop('materials', [])

    # Create production line
    line_result = supabase.table('production_lines').insert(data).execute()

    if not line_result.data:
        raise Exception("Failed to create production line")

    line = line_result.data[0]
    line_id = line['id']

    # Create materials if any
    if materials:
        materials_data = []
        for material in materials:
            materials_data.append({
                'production_line_id': line_id,
                'material_code': material['material_code'],
                'material_name': material['material_name'],
                'quantity_per_unit': material['quantity_per_unit'],
                'unit': material['unit']
            })

        materials_result = supabase.table('production_line_materials').insert(materials_data).execute()

        if materials_result.data:
            line['materials'] = materials_result.data
        else:
            line['materials'] = []

    return line

async def update_production_line(line_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Update a production line and its materials"""
    if not supabase:
        raise Exception("Supabase not configured")

    # Extract materials from data
    materials = data.pop('materials', None)

    # Update production line
    line_result = supabase.table('production_lines').update(data).eq('id', line_id).execute()

    if not line_result.data:
        raise Exception("Failed to update production line")

    line = line_result.data[0]

    # Update materials if provided
    if materials is not None:
        # Delete existing materials
        supabase.table('production_line_materials').delete().eq('production_line_id', line_id).execute()

        # Insert new materials
        if materials:
            materials_data = []
            for material in materials:
                materials_data.append({
                    'production_line_id': line_id,
                    'material_code': material['material_code'],
                    'material_name': material['material_name'],
                    'quantity_per_unit': material['quantity_per_unit'],
                    'unit': material['unit']
                })

            materials_result = supabase.table('production_line_materials').insert(materials_data).execute()
            line['materials'] = materials_result.data if materials_result.data else []
        else:
            line['materials'] = []

    # Get current materials if not updating them
    else:
        materials_result = supabase.table('production_line_materials').select('*').eq('production_line_id', line_id).execute()
        line['materials'] = materials_result.data if materials_result.data else []

    return line

async def delete_production_line(line_id: str) -> bool:
    """Delete a production line (materials will be deleted automatically due to CASCADE)"""
    if not supabase:
        raise Exception("Supabase not configured")

    result = supabase.table('production_lines').delete().eq('id', line_id).execute()

    return len(result.data) > 0 if result.data else False
