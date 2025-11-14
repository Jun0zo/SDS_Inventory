"""
New ingestion logic that stores all Google Sheet columns directly
No JSONB - all columns mapped to PostgreSQL columns
"""
import asyncio
import uuid
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
import logging

from sheets import fetch_sheet_values, normalize
from models_extended import ClassificationConfig, IngestResult
from column_mapping import map_wms_row, map_sap_row, get_split_key
from supabase_client import get_warehouse_binding, supabase

logger = logging.getLogger(__name__)

async def update_materials_catalog(rows: List[Dict[str, Any]], source_type: str) -> int:
    """Update materials catalog with item codes from sync data"""
    if not supabase or not rows:
        return 0
    
    # Extract unique item codes
    materials_to_upsert = {}
    
    for row in rows:
        # Get item code (WMS uses item_code, SAP uses material)
        item_code = row.get('item_code') if source_type == 'wms' else row.get('material')
        if not item_code:
            continue
        
        # Get description
        description = None
        if source_type == 'wms':
            description = row.get('description') or row.get('item_nm')
        else:  # sap
            description = row.get('material_description')
        
        # Get unit
        unit = row.get('unit') if source_type == 'wms' else row.get('base_unit_of_measure')
        
        # Store unique materials
        if item_code not in materials_to_upsert:
            materials_to_upsert[item_code] = {
                'item_code': item_code,
                'description': description,
                'unit': unit,
                'source_system': source_type,
                'last_seen_at': datetime.utcnow().isoformat()
            }
    
    if not materials_to_upsert:
        return 0
    
    # Batch upsert materials (much more efficient!)
    materials_list = list(materials_to_upsert.values())
    upserted_count = 0
    
    try:
        # Use Supabase upsert with onConflict
        # This does INSERT or UPDATE in one query
        result = supabase.table('materials').upsert(
            materials_list,
            on_conflict='item_code',
            ignore_duplicates=False
        ).execute()
        
        upserted_count = len(result.data) if result.data else len(materials_list)
        logger.info(f"📦 Upserted {upserted_count} materials into catalog (batch operation)")
        
    except Exception as e:
        logger.error(f"Error batch upserting materials: {e}")
        # Fallback to individual inserts if batch fails
        logger.info("Falling back to individual upserts...")
        for material in materials_list:
            try:
                supabase.table('materials').upsert(
                    material,
                    on_conflict='item_code'
                ).execute()
                upserted_count += 1
            except Exception as e2:
                logger.error(f"Error upserting material {material['item_code']}: {e2}")
    
    return upserted_count

async def insert_wms_rows(rows: List[Dict[str, Any]]) -> int:
    """Insert WMS rows into wms_raw_rows table"""
    if not supabase or not rows:
        return 0
    
    # Insert in batches
    batch_size = 3000
    total_inserted = 0
    
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            result = supabase.table('wms_raw_rows').insert(batch).execute()
            total_inserted += len(result.data) if result.data else 0
        except Exception as e:
            logger.error(f"Error inserting WMS batch {i//batch_size + 1}: {e}")
    
    return total_inserted

async def insert_sap_rows(rows: List[Dict[str, Any]]) -> int:
    """Insert SAP rows into sap_raw_rows table"""
    if not supabase or not rows:
        return 0
    
    # Insert in batches
    batch_size = 1000
    total_inserted = 0
    
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            result = supabase.table('sap_raw_rows').insert(batch).execute()
            total_inserted += len(result.data) if result.data else 0
        except Exception as e:
            logger.error(f"Error inserting SAP batch {i//batch_size + 1}: {e}")
    
    return total_inserted

async def ingest_source(
    source: Dict[str, Any],
    warehouse_code: Optional[str],
    batch_id: str,
    dry_run: bool = False,
    split_value: Optional[str] = None
) -> Tuple[int, List[str]]:
    """
    Ingest data from a single Google Sheet source.
    All columns are stored directly in PostgreSQL.
    """
    source_type = source['type']
    logger.info(f"Starting ingestion for {source_type} source {source['label']}, split_value='{split_value}', dry_run={dry_run}")
    errors = []
    rows_processed = 0

    try:

        # Fetch sheet data
        logger.info(f"Fetching data for source {source['label']} (type: {source_type})")
        try:
            values = await fetch_sheet_values(
                source['spreadsheet_id'],
                source['sheet_name'],
                None
            )
            logger.info(f"Sheet fetch result: {'SUCCESS' if values else 'FAILED'}, rows: {len(values) if values else 0}")
            if values and len(values) > 0:
                logger.info(f"First row preview: {values[0][:5] if len(values[0]) >= 5 else values[0]}")
        except Exception as e:
            logger.error(f"Sheet fetch EXCEPTION: {e}")
            values = None

        logger.info(f"Source {source['label']}: Fetched {len(values) if values else 0} rows")
        if source_type == 'sap' and values:
            logger.info(f"SAP headers: {values[0] if len(values) > 0 else 'No headers'}")
            logger.info(f"SAP first data row: {values[1] if len(values) > 1 else 'No data rows'}")

            if len(values) > 0:
                header_row = values[0]
                logger.info(f"SAP header row has {len(header_row)} columns")

                # Check if first row looks like headers
                header_like_count = sum(1 for h in header_row if h and isinstance(h, str) and len(h.strip()) > 0)
                logger.info(f"SAP header-like cells: {header_like_count}/{len(header_row)}")

                material_idx = None
                for i, header in enumerate(header_row):
                    if header and 'material' in header.lower():
                        material_idx = i
                        break

                if material_idx is not None:
                    logger.info(f"SAP 'Material' column found at index {material_idx}")
                    # Check multiple data rows for material values
                    material_values_found = 0
                    empty_material_count = 0
                    for row_idx in range(1, min(11, len(values))):  # Check first 10 data rows
                        if row_idx < len(values):
                            row = values[row_idx]
                            if material_idx < len(row):
                                material_value = row[material_idx]
                                if material_value and str(material_value).strip():
                                    material_values_found += 1
                                    logger.info(f"SAP row {row_idx} material value: '{material_value}'")
                                else:
                                    empty_material_count += 1
                                    logger.warning(f"SAP row {row_idx} material EMPTY: '{material_value}'")
                    logger.info(f"SAP material values: {material_values_found} found, {empty_material_count} empty")

                    if material_values_found == 0:
                        logger.error(f"CRITICAL: All SAP material values are empty! No rows will be inserted!")
                        logger.error(f"SAP first 5 empty values: {[values[i][material_idx] if i < len(values) and material_idx < len(values[i]) else 'INDEX_ERROR' for i in range(1, 6)]}")
                else:
                    logger.error(f"SAP 'Material' column NOT found. Available headers: {[h for h in header_row if h]}")

        if not values or len(values) < 2:
            errors.append(f"Source {source['label']}: No data found")
            logger.error(f"CRITICAL: SAP source {source['label']} returned no data!")
            logger.error(f"  - values is None: {values is None}")
            logger.error(f"  - len(values): {len(values) if values else 'N/A'}")
            if values and len(values) >= 1:
                logger.error(f"  - first row: {values[0][:5] if len(values[0]) >= 5 else values[0]}")
            return 0, errors

        # Get header and normalize rows
        header = values[0]
        normalized_rows = normalize(values)

        logger.info(f"📊 Source {source['label']}: Fetched {len(values)} total rows from Google Sheet")
        logger.info(f"📊 After normalization: {len(normalized_rows)} valid rows")

        if not normalized_rows:
            errors.append(f"Source {source['label']}: No valid rows after normalization")
            return 0, errors

        # Parse classification config
        classification = ClassificationConfig(**source.get('classification', {}))

        # Log classification config
        if classification.split_enabled:
            logger.info(f"🔀 Split enabled: column = '{classification.split_by_column}'")

        # Prepare rows for insertion
        rows_to_insert = []
        skipped_by_split = 0
        skipped_no_item = 0
        split_values_found = set()  # Track unique split values
        
        for i, norm_row in enumerate(normalized_rows):
            # Map Google Sheet columns to PostgreSQL columns
            if source_type == 'wms':
                mapped_row = map_wms_row(norm_row, classification)
            else:  # sap
                mapped_row = map_sap_row(norm_row, classification)

            # Debug: Print first few SAP rows
            if source_type == 'sap' and i < 5:
                logger.info(f"SAP row {i}: material={mapped_row.get('material')}, unrestricted_qty={mapped_row.get('unrestricted_qty')}")
                logger.info(f"SAP row {i} keys: {list(mapped_row.keys())}")
                logger.info(f"SAP row {i} original data keys: {list(norm_row.keys()) if isinstance(norm_row, dict) else 'not dict'}")
                # Check if 'Material' header exists in original data
                if 'Material' in norm_row:
                    logger.info(f"SAP row {i}: 'Material' header found with value: {norm_row['Material']}")
                else:
                    logger.info(f"SAP row {i}: 'Material' header NOT found in original data")

                # Check if material is empty/null - this could cause insertion failure
                material_value = mapped_row.get('material')
                if not material_value or str(material_value).strip() == '':
                    logger.warning(f"SAP row {i}: material is empty/null! This row will NOT be inserted!")
                else:
                    logger.info(f"SAP row {i}: material OK - will be inserted")

            # Skip rows without item/material code
            item_code = mapped_row.get('item_code') or mapped_row.get('material')
            if not item_code:
                skipped_no_item += 1
                if source_type == 'sap' and i < 5:  # Log first few missing materials
                    logger.info(f"SAP row {i} missing material: {mapped_row}")
                # TEMPORARILY DISABLE SKIP FOR DEBUGGING
                # continue
                logger.warning(f"SAP row {i}: ALLOWING INSERT despite missing material (DEBUG MODE)")
                item_code = f"NO_MATERIAL_{i}"  # Temporary item code for debugging
            
            # Extract split_key
            split_key = get_split_key(mapped_row, classification)
            
            # Track unique split values
            if split_key:
                split_values_found.add(split_key)
            
            # Filter by split_value if specified
            if split_value and split_key != split_value:
                skipped_by_split += 1
                if source_type == 'sap' and skipped_by_split < 6:  # Log first few skips
                    logger.info(f"SAP row {i} skipped by split filter: split_key='{split_key}' != split_value='{split_value}'")
                continue
            elif split_value and source_type == 'sap' and i < 3:  # Log successful matches
                logger.info(f"SAP row {i} passed split filter: split_key='{split_key}' == split_value='{split_value}'")
            
            # Note: warehouse_code column removed from tables
            # split_key is stored for warehouse-specific filtering during read
            mapped_row['source_id'] = source['id']
            mapped_row['source_type'] = source_type  # Required NOT NULL field
            mapped_row['split_key'] = split_key
            mapped_row['batch_id'] = batch_id
            mapped_row['fetched_at'] = datetime.utcnow().isoformat()
            
            rows_to_insert.append(mapped_row)
        
        # Log filtering results
        logger.info(f"📈 Source {source['label']} filtering results:")
        logger.info(f"   - Total normalized rows: {len(normalized_rows)}")
        logger.info(f"   - Skipped (no item code): {skipped_no_item}")
        logger.info(f"   - Skipped (split filter): {skipped_by_split}")
        logger.info(f"   - Ready to insert: {len(rows_to_insert)}")
        if split_value:
            logger.info(f"   - Filtering by split_value: '{split_value}'")
        if split_values_found:
            logger.info(f"   - Unique split values found in data: {sorted(split_values_found)}")
            logger.info(f"   - Total unique split values: {len(split_values_found)}")
        
        if not dry_run and rows_to_insert:
            # Insert into appropriate table
            if source_type == 'wms':
                rows_processed = await insert_wms_rows(rows_to_insert)
                logger.info(f"✅ Inserted {rows_processed} WMS rows from {source['label']}")
            else:
                rows_processed = await insert_sap_rows(rows_to_insert)
                logger.info(f"✅ Inserted {rows_processed} SAP rows from {source['label']}")
            
            # Update materials catalog
            try:
                materials_updated = await update_materials_catalog(rows_to_insert, source_type)
                logger.info(f"📦 Updated {materials_updated} materials in catalog from {source['label']}")
            except Exception as e:
                logger.error(f"Failed to update materials catalog: {e}")
        else:
            rows_processed = len(rows_to_insert)
            logger.info(f"Dry run: Would insert {rows_processed} {source_type.upper()} rows from {source['label']}")
        
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
                split_value=split_value
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
                    result.sources_processed += 1
                    result.errors.extend([{'type': 'source_error', 'message': err} for err in errors])
    
    except Exception as e:
        result.errors.append({
            'type': 'general_error',
            'message': str(e)
        })
        logger.error(f"Error ingesting warehouse {warehouse_code}: {e}")
    
    # Update zone capacities if WMS data was processed
    debug_logs = []
    debug_logs.append(f"🔥🔥🔥 SNAPSHOT DEBUG for {warehouse_code} 🔥🔥🔥")
    debug_logs.append(f"   dry_run parameter: {dry_run}")
    debug_logs.append(f"   types parameter: {types}")
    debug_logs.append(f"   result.rows_inserted: {getattr(result, 'rows_inserted', 'NO_ATTR')}")
    debug_logs.append(f"   result object: {result}")

    debug_logs.append(f"🔍 Checking snapshot conditions for {warehouse_code}:")
    debug_logs.append(f"   - 'wms' in types: {'wms' in types}")
    debug_logs.append(f"   - result.rows_inserted > 0: {getattr(result, 'rows_inserted', 0) > 0}")
    debug_logs.append(f"   - not dry_run: {not dry_run}")
    debug_logs.append(f"   - ALL conditions met: {'wms' in types and getattr(result, 'rows_inserted', 0) > 0 and not dry_run}")

    if 'wms' in types and result.rows_inserted > 0 and not dry_run:
        debug_logs.append(f"✅ Conditions met for {warehouse_code}, updating snapshots...")

        try:
            from zone_capacity import get_zone_capacity_manager
            manager = get_zone_capacity_manager()
            manager.update_current_quantities([warehouse_code])
            debug_logs.append(f"✅ Updated zone capacities for warehouse {warehouse_code}")
        except Exception as e:
            debug_logs.append(f"❌ Failed to update zone capacities for warehouse {warehouse_code}: {e}")

        # Update inventory snapshot for this warehouse
        debug_logs.append(f"🚀 Starting inventory snapshot update for {warehouse_code}...")
        try:
            debug_logs.append(f"   Importing inventory_snapshot module...")
            from inventory_snapshot import get_inventory_snapshot_manager
            debug_logs.append(f"   Getting snapshot manager...")
            snapshot_manager = get_inventory_snapshot_manager()
            debug_logs.append(f"   Calling update_inventory_snapshot...")
            await snapshot_manager.update_inventory_snapshot(warehouse_code)
            debug_logs.append(f"✅ COMPLETED: Updated inventory snapshot for warehouse {warehouse_code}")

            # 파일 생성 확인
            import os
            snapshot_path = f"data/inventory_snapshots/{warehouse_code}.json"
            if os.path.exists(snapshot_path):
                size = os.path.getsize(snapshot_path)
                debug_logs.append(f"✅ FILE CREATED: {snapshot_path} ({size} bytes)")
            else:
                debug_logs.append(f"❌ FILE NOT FOUND: {snapshot_path}")

        except Exception as e:
            debug_logs.append(f"❌ FAILED: Inventory snapshot update for {warehouse_code}: {e}")
            import traceback
            debug_logs.append(traceback.format_exc())

        # Update dashboard cache for this warehouse
        debug_logs.append(f"📊 Starting dashboard cache update for {warehouse_code}...")
        try:
            debug_logs.append(f"   Importing dashboard_cache module...")
            from dashboard_cache import get_dashboard_cache_manager
            debug_logs.append(f"   Getting cache manager...")
            cache_manager = get_dashboard_cache_manager()
            debug_logs.append(f"   Updating all dashboard caches...")

            # Update all dashboard caches (inventory stats, zone utilization, etc.)
            await cache_manager.get_inventory_stats([warehouse_code])  # This will calculate and cache
            await cache_manager.get_zone_utilization([warehouse_code])
            await cache_manager.get_user_defined_zones([warehouse_code])
            await cache_manager.get_expiring_items([warehouse_code])

            debug_logs.append(f"✅ COMPLETED: Updated dashboard cache for warehouse {warehouse_code}")

            # 캐시 파일들 확인
            import os
            cache_dir = "data/dashboard_cache"
            if os.path.exists(cache_dir):
                cache_files = [f for f in os.listdir(cache_dir) if f.endswith('.json') and warehouse_code in f]
                debug_logs.append(f"✅ CACHE FILES CREATED: {len(cache_files)} files for {warehouse_code}")
                for cache_file in cache_files[:3]:  # 처음 3개만 표시
                    file_path = f"{cache_dir}/{cache_file}"
                    size = os.path.getsize(file_path)
                    debug_logs.append(f"   📄 {cache_file} ({size} bytes)")
            else:
                debug_logs.append(f"❌ CACHE DIR NOT FOUND: {cache_dir}")

        except Exception as e:
            debug_logs.append(f"❌ FAILED: Dashboard cache update for {warehouse_code}: {e}")
            import traceback
            debug_logs.append(traceback.format_exc())

        # Refresh all materialized views after data ingestion
        debug_logs.append(f"🔄 Refreshing all materialized views...")
        try:
            result_mv = supabase.rpc('refresh_all_materialized_views').execute()
            debug_logs.append(f"✅ COMPLETED: All materialized views refreshed successfully")
            if result_mv.data:
                debug_logs.append(f"   MV Refresh Results: {result_mv.data}")
        except Exception as e:
            debug_logs.append(f"⚠️ WARNING: Materialized view refresh failed: {e}")
            # Don't raise - allow ingestion to succeed even if MV refresh fails

    else:
        debug_logs.append(f"❌ Conditions NOT met for {warehouse_code}, skipping snapshot updates")

    # Debug logs를 result에 추가
    result.debug_logs = debug_logs

    # Calculate duration
    result.duration_seconds = (datetime.utcnow() - start_time).total_seconds()

    return result
