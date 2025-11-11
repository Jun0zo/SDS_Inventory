"""
Location-based inventory query endpoints
Maps Zone components (Rack/Flat locations) to actual WMS raw data
"""

from typing import Dict, List, Optional
from pydantic import BaseModel
import httpx
import os

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")


async def get_lot_column_for_warehouse(client: httpx.AsyncClient, warehouse_code: str) -> Optional[str]:
    """
    Get the lot column name from WMS source classification for a warehouse
    Similar to get_location_column_for_warehouse but for lot columns
    """
    try:
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json",
        }

        print(f"🔍 Checking lot column for warehouse: '{warehouse_code}'")

        # Check if warehouse_code is a UUID (warehouse.id) or code
        import uuid
        try:
            uuid.UUID(warehouse_code)  # Try to parse as UUID
            is_uuid = True
            warehouse_id = warehouse_code
            print(f"📋 warehouse_code is UUID (id): {warehouse_code}")
        except ValueError:
            is_uuid = False
            warehouse_id = None
            print(f"📋 warehouse_code is code: {warehouse_code}")

        # If it's not a UUID, get the warehouse_id from code
        if not is_uuid:
            print("🔄 Converting warehouse code to UUID...")
            warehouse_url = f"{SUPABASE_URL}/rest/v1/warehouses"
            warehouse_params = {
                "code": f"eq.{warehouse_code}",
                "select": "id",
            }
            warehouse_response = await client.get(warehouse_url, headers=headers, params=warehouse_params)
            warehouse_response.raise_for_status()
            warehouses = warehouse_response.json()

            if warehouses and len(warehouses) > 0:
                warehouse_id = warehouses[0]["id"]
                print(f"✅ Found warehouse id: '{warehouse_id}'")
            else:
                print(f"❌ No warehouse found with code: {warehouse_code}")
                return None

        # Get warehouse bindings to find associated WMS sources
        binding_url = f"{SUPABASE_URL}/rest/v1/warehouse_bindings"
        binding_params = {
            "warehouse_id": f"eq.{warehouse_id}",
            "select": "source_bindings",
        }

        binding_response = await client.get(binding_url, headers=headers, params=binding_params)
        binding_response.raise_for_status()
        bindings = binding_response.json()

        print(f"📊 Found {len(bindings)} warehouse binding(s)")
        if not bindings:
            print(f"❌ No warehouse bindings found for warehouse_id '{warehouse_id}'")
            return None

        source_bindings = bindings[0].get("source_bindings", {})
        print(f"🔗 Source bindings: {source_bindings}")

        if not source_bindings:
            print(f"❌ No source bindings in warehouse binding for warehouse_id '{warehouse_id}'")
            return None

        # Find WMS sources - handle both old and new binding key formats
        wms_sources = []
        for bind_key, binding_info in source_bindings.items():
            if binding_info.get("type") == "wms":
                # Extract source_id from key (handle "source_id::split_value" format)
                if '::' in bind_key:
                    source_id = bind_key.split('::', 1)[0]
                else:
                    source_id = bind_key
                
                if source_id not in wms_sources:
                    wms_sources.append(source_id)

        if not wms_sources:
            print(f"❌ No WMS sources found in bindings for warehouse_id '{warehouse_id}'")
            return None

        print(f"📋 Found {len(wms_sources)} unique WMS source(s): {wms_sources}")

        # Check each WMS source
        for source_id in wms_sources:
            print(f"🔎 Checking WMS source: {source_id}")

            # Query the sheet_sources table for classification
            source_url = f"{SUPABASE_URL}/rest/v1/sheet_sources"
            source_params = {
                "id": f"eq.{source_id}",
                "select": "classification",
            }
            source_response = await client.get(source_url, headers=headers, params=source_params)
            source_response.raise_for_status()
            sources = source_response.json()

            print(f"📄 Sheet source data: {sources}")

            if sources and len(sources) > 0:
                classification = sources[0].get("classification", {})
                print(f"🏷️ Classification: {classification}")

                lot_col = classification.get("lot_col")
                if lot_col:
                    print(f"✅ Found lot column: '{lot_col}'")
                    return lot_col
                else:
                    print(f"❌ No lot_col in classification for source {source_id}")
            else:
                print(f"❌ No sheet source data for source {source_id}")

        print(f"❌ No valid lot column found for warehouse_id '{warehouse_id}'")
        return None

    except Exception as e:
        print(f"💥 Error getting lot column for warehouse {warehouse_code}: {e}")
        return None

async def get_qty_column_for_warehouse(client: httpx.AsyncClient, warehouse_code: str) -> Optional[str]:
    """
    Get the quantity column name from WMS source classification for a warehouse
    Similar to get_location_column_for_warehouse but for quantity columns
    """
    try:
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json",
        }

        print(f"🔍 Checking quantity column for warehouse: '{warehouse_code}'")

        # Check if warehouse_code is a UUID (warehouse.id) or code
        import uuid
        try:
            uuid.UUID(warehouse_code)  # Try to parse as UUID
            is_uuid = True
            warehouse_id = warehouse_code
            print(f"📋 warehouse_code is UUID (id): {warehouse_code}")
        except ValueError:
            is_uuid = False
            warehouse_id = None
            print(f"📋 warehouse_code is code: {warehouse_code}")

        # If it's not a UUID, get the warehouse_id from code
        if not is_uuid:
            print("🔄 Converting warehouse code to UUID...")
            warehouse_url = f"{SUPABASE_URL}/rest/v1/warehouses"
            warehouse_params = {
                "code": f"eq.{warehouse_code}",
                "select": "id",
            }
            warehouse_response = await client.get(warehouse_url, headers=headers, params=warehouse_params)
            warehouse_response.raise_for_status()
            warehouses = warehouse_response.json()

            if warehouses and len(warehouses) > 0:
                warehouse_id = warehouses[0]["id"]
                print(f"✅ Found warehouse id: '{warehouse_id}'")
            else:
                print(f"❌ No warehouse found with code: {warehouse_code}")
                return None

        # Get warehouse bindings to find associated WMS sources
        binding_url = f"{SUPABASE_URL}/rest/v1/warehouse_bindings"
        binding_params = {
            "warehouse_id": f"eq.{warehouse_id}",
            "select": "source_bindings",
        }

        binding_response = await client.get(binding_url, headers=headers, params=binding_params)
        binding_response.raise_for_status()
        bindings = binding_response.json()

        print(f"📊 Found {len(bindings)} warehouse binding(s)")
        if not bindings:
            print(f"❌ No warehouse bindings found for warehouse_id '{warehouse_id}'")
            return None

        source_bindings = bindings[0].get("source_bindings", {})
        print(f"🔗 Source bindings: {source_bindings}")

        if not source_bindings:
            print(f"❌ No source bindings in warehouse binding for warehouse_id '{warehouse_id}'")
            return None

        # Find WMS sources - handle both old and new binding key formats
        wms_sources = []
        for bind_key, binding_info in source_bindings.items():
            if binding_info.get("type") == "wms":
                # Extract source_id from key (handle "source_id::split_value" format)
                if '::' in bind_key:
                    source_id = bind_key.split('::', 1)[0]
                else:
                    source_id = bind_key
                
                if source_id not in wms_sources:
                    wms_sources.append(source_id)

        if not wms_sources:
            print(f"❌ No WMS sources found in bindings for warehouse_id '{warehouse_id}'")
            return None

        print(f"📋 Found {len(wms_sources)} unique WMS source(s): {wms_sources}")

        # Check each WMS source
        for source_id in wms_sources:
            print(f"🔎 Checking WMS source: {source_id}")

            # Query the sheet_sources table for classification
            source_url = f"{SUPABASE_URL}/rest/v1/sheet_sources"
            source_params = {
                "id": f"eq.{source_id}",
                "select": "classification",
            }
            source_response = await client.get(source_url, headers=headers, params=source_params)
            source_response.raise_for_status()
            sources = source_response.json()

            print(f"📄 Sheet source data: {sources}")

            if sources and len(sources) > 0:
                classification = sources[0].get("classification", {})
                print(f"🏷️ Classification: {classification}")

                qty_col = classification.get("qty_col")
                if qty_col:
                    print(f"✅ Found quantity column: '{qty_col}'")
                    return qty_col
                else:
                    print(f"❌ No qty_col in classification for source {source_id}")
            else:
                print(f"❌ No sheet source data for source {source_id}")

        print(f"❌ No valid quantity column found for warehouse_id '{warehouse_id}'")
        return None

    except Exception as e:
        print(f"💥 Error getting quantity column for warehouse {warehouse_code}: {e}")
        return None

async def get_location_column_for_warehouse(client: httpx.AsyncClient, warehouse_code: str) -> Optional[str]:
    """
    Get the location column name from WMS source classification for a warehouse
    warehouse_code can be either warehouse.id (UUID) or warehouse.code (like 'EA2-F')
    """
    try:
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json",
        }

        print(f"🔍 Checking location column for warehouse: '{warehouse_code}'")

        # Check if warehouse_code is a UUID (warehouse.id) or code
        import uuid
        try:
            uuid.UUID(warehouse_code)  # Try to parse as UUID
            is_uuid = True
            warehouse_id = warehouse_code
            print(f"📋 warehouse_code is UUID (id): {warehouse_code}")
        except ValueError:
            is_uuid = False
            warehouse_id = None
            print(f"📋 warehouse_code is code: {warehouse_code}")

        # If it's not a UUID, get the warehouse_id from code
        if not is_uuid:
            print("🔄 Converting warehouse code to UUID...")
            warehouse_url = f"{SUPABASE_URL}/rest/v1/warehouses"
            warehouse_params = {
                "code": f"eq.{warehouse_code}",
                "select": "id",
            }
            warehouse_response = await client.get(warehouse_url, headers=headers, params=warehouse_params)
            warehouse_response.raise_for_status()
            warehouses = warehouse_response.json()

            if warehouses and len(warehouses) > 0:
                warehouse_id = warehouses[0]["id"]
                print(f"✅ Found warehouse id: '{warehouse_id}'")
            else:
                print(f"❌ No warehouse found with code: {warehouse_code}")
                return None

        # Get warehouse bindings to find associated WMS sources
        # warehouse_bindings table uses warehouse_id (UUID), not warehouse_code
        binding_url = f"{SUPABASE_URL}/rest/v1/warehouse_bindings"
        binding_params = {
            "warehouse_id": f"eq.{warehouse_id}",
            "select": "source_bindings",
        }

        binding_response = await client.get(binding_url, headers=headers, params=binding_params)
        binding_response.raise_for_status()
        bindings = binding_response.json()

        print(f"📊 Found {len(bindings)} warehouse binding(s)")
        if not bindings:
            print(f"❌ No warehouse bindings found for warehouse_id '{warehouse_id}'")
            return None

        source_bindings = bindings[0].get("source_bindings", {})
        print(f"🔗 Source bindings: {source_bindings}")

        if not source_bindings:
            print(f"❌ No source bindings in warehouse binding for warehouse_id '{warehouse_id}'")
            return None

        # Find WMS sources - handle both old and new binding key formats
        wms_sources = []
        for bind_key, binding_info in source_bindings.items():
            if binding_info.get("type") == "wms":
                # Extract source_id from key (handle "source_id::split_value" format)
                if '::' in bind_key:
                    source_id = bind_key.split('::', 1)[0]
                else:
                    source_id = bind_key
                
                if source_id not in wms_sources:
                    wms_sources.append(source_id)

        if not wms_sources:
            print(f"❌ No WMS sources found in bindings for warehouse_id '{warehouse_id}'")
            return None

        print(f"📋 Found {len(wms_sources)} unique WMS source(s): {wms_sources}")

        # Check each WMS source
        for source_id in wms_sources:
            print(f"🔎 Checking WMS source: {source_id}")

            # Query the sheet_sources table for classification
            source_url = f"{SUPABASE_URL}/rest/v1/sheet_sources"
            source_params = {
                "id": f"eq.{source_id}",
                "select": "classification",
            }
            source_response = await client.get(source_url, headers=headers, params=source_params)
            source_response.raise_for_status()
            sources = source_response.json()

            print(f"📄 Sheet source data: {sources}")

            if sources and len(sources) > 0:
                classification = sources[0].get("classification", {})
                print(f"🏷️ Classification: {classification}")

                location_col = classification.get("location_col")
                if location_col:
                    print(f"✅ Found location column: '{location_col}'")
                    return location_col
                else:
                    print(f"❌ No location_col in classification for source {source_id}")
            else:
                print(f"❌ No sheet source data for source {source_id}")

        print(f"❌ No valid location column found for warehouse_id '{warehouse_id}'")
        return None

    except Exception as e:
        print(f"💥 Error getting location column for warehouse {warehouse_code}: {e}")
        return None


class LocationInventoryRequest(BaseModel):
    warehouse_code: str
    location: str


class BatchLocationInventoryRequest(BaseModel):
    warehouse_code: str
    locations: List[str]


class LocationInventoryItem(BaseModel):
    id: int
    item_code: str
    lot_key: Optional[str]
    available_qty: Optional[float]
    total_qty: Optional[float]
    inb_date: Optional[str]
    valid_date: Optional[str]
    prod_date: Optional[str]
    uld: Optional[str]
    extra_columns: Dict
    fetched_at: str


class LocationInventorySummary(BaseModel):
    location: str
    zone: str
    total_items: int
    total_quantity: float
    unique_item_codes: int
    items: List[LocationInventoryItem]
    last_updated: Optional[str]


async def get_location_inventory(
    warehouse_code: str,
    location: str
) -> LocationInventorySummary:
    """
    Get inventory for a specific location from WMS raw data
    warehouse_code can be either warehouse.id (UUID) or warehouse.code (like 'EA2-F')
    
    This function:
    1. Gets the location column name from WMS sheet source configuration (classification.location_col)
    2. Maps that Google Sheet column to the PostgreSQL column name (e.g., "Cell No." -> "cell_no")
    3. Queries wms_raw_rows using the PostgreSQL column name
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json",
        }

        # Get location column name from WMS source classification
        # This returns the Google Sheet header name (e.g., "Cell No.")
        location_col_from_sheet = await get_location_column_for_warehouse(client, warehouse_code)
        
        if not location_col_from_sheet:
            print(f"⚠️ No location column configured for warehouse '{warehouse_code}', using default 'cell_no'")
            location_pg_column = "cell_no"  # Default PostgreSQL column
        else:
            # Map Google Sheet column name to PostgreSQL column name
            from column_mapping import WMS_COLUMN_MAP
            location_pg_column = WMS_COLUMN_MAP.get(location_col_from_sheet, "cell_no")
            print(f"📊 Mapped '{location_col_from_sheet}' (Sheet) -> '{location_pg_column}' (PostgreSQL)")

        # Get lot column name from WMS source classification
        lot_col_from_sheet = await get_lot_column_for_warehouse(client, warehouse_code)
        
        if not lot_col_from_sheet:
            print(f"⚠️ No lot column configured for warehouse '{warehouse_code}', using default 'lot_no'")
            lot_pg_column = "lot_no"  # Default PostgreSQL column
        else:
            # Map Google Sheet column name to PostgreSQL column name
            from column_mapping import WMS_COLUMN_MAP
            lot_pg_column = WMS_COLUMN_MAP.get(lot_col_from_sheet, "lot_no")
            print(f"📊 Mapped '{lot_col_from_sheet}' (Sheet) -> '{lot_pg_column}' (PostgreSQL)")

        # Get quantity column name from WMS source classification
        qty_col_from_sheet = await get_qty_column_for_warehouse(client, warehouse_code)
        
        if not qty_col_from_sheet:
            print(f"⚠️ No quantity column configured for warehouse '{warehouse_code}', using default 'available_qty'")
            qty_pg_column = "available_qty"  # Default PostgreSQL column
        else:
            # Map Google Sheet column name to PostgreSQL column name
            from column_mapping import WMS_COLUMN_MAP
            qty_pg_column = WMS_COLUMN_MAP.get(qty_col_from_sheet, "available_qty")
            print(f"📊 Mapped '{qty_col_from_sheet}' (Sheet) -> '{qty_pg_column}' (PostgreSQL)")

        # Debug: Show which columns are being used
        print(f"🔍 Matching location '{location}' using PostgreSQL column '{location_pg_column}' for warehouse '{warehouse_code}'")
        print(f"🔍 Reading lot from column '{lot_pg_column}'")
        print(f"🔍 Reading quantity from column '{qty_pg_column}'")

        url = f"{SUPABASE_URL}/rest/v1/wms_raw_rows"

        # Query by source_id (warehouse_code column removed)
        # Get sources from warehouse bindings to know which sources to query
        binding_url = f"{SUPABASE_URL}/rest/v1/warehouse_bindings"

        # Get all warehouse bindings to find WMS sources (warehouse_code column removed)
        binding_params = {
            "select": "source_bindings",
        }
        
        binding_response = await client.get(binding_url, headers=headers, params=binding_params)
        binding_response.raise_for_status()
        bindings = binding_response.json()
        
        if not bindings or len(bindings) == 0:
            print(f"⚠️ No bindings found for warehouse '{actual_warehouse_code}'")
            return LocationInventorySummary(
                location=location,
                zone="",
                total_items=0,
                total_quantity=0.0,
                unique_item_codes=0,
                items=[],
                last_updated=None,
            )
        
        source_bindings = bindings[0].get("source_bindings", {})
        
        # Collect all WMS source IDs and their split values
        wms_sources = []
        for bind_key, binding_info in source_bindings.items():
            if binding_info.get("type") == "wms":
                # Extract source_id and split_value from key
                if '::' in bind_key:
                    source_id, split_value = bind_key.split('::', 1)
                else:
                    source_id = bind_key
                    split_value = binding_info.get('split_value')
                
                wms_sources.append({
                    'source_id': source_id,
                    'split_value': split_value
                })
        
        if not wms_sources:
            print(f"⚠️ No WMS sources configured for warehouse '{actual_warehouse_code}'")
            return LocationInventorySummary(
                location=location,
                zone="",
                total_items=0,
                total_quantity=0.0,
                unique_item_codes=0,
                items=[],
                last_updated=None,
            )
        
        print(f"📋 Found {len(wms_sources)} WMS source(s) for warehouse '{actual_warehouse_code}'")
        
        # Query wms_raw_rows for all WMS sources
        all_rows = []
        for source_info in wms_sources:
            source_id = source_info['source_id']
            split_value = source_info['split_value']
            
            # Build query for this source
            # Use 'or' filter for multiple possible location column values
            # Since we're matching by the mapped PostgreSQL column
            params = {
                "source_id": f"eq.{source_id}",
                location_pg_column: f"eq.{location}",
                "select": "*",
                "order": "fetched_at.desc",
            }
            
            # Add split_key filter if specified
            if split_value:
                params["split_key"] = f"eq.{split_value}"
            
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()
            
            source_rows = response.json()
            print(f"  Source {source_id} (split: {split_value}): Found {len(source_rows)} rows")
            all_rows.extend(source_rows)
        
        rows = all_rows
        print(f"✅ Total found: {len(rows)} rows for location '{location}' using column '{location_pg_column}'")

        # Calculate summary
        if not rows:
            return LocationInventorySummary(
                location=location,
                zone="",
                total_items=0,
                total_quantity=0.0,
                unique_item_codes=0,
                items=[],
                last_updated=None,
            )
        
        # Extract zone from first row
        zone = rows[0].get("zone", "")
        
        # Calculate totals using dynamic quantity column
        total_quantity = sum(
            float(row.get(qty_pg_column) or 0) for row in rows
        )
        
        unique_item_codes = len(set(row.get("item_code") for row in rows if row.get("item_code")))
        
        last_updated = rows[0].get("fetched_at") if rows else None
        
        # Convert to items using dynamic lot and quantity columns
        items = []
        for row in rows:
            try:
                item = LocationInventoryItem(
                    id=int(row["id"]),
                    item_code=str(row.get("item_code", "")),
                    lot_key=row.get(lot_pg_column),  # Use dynamic lot column
                    available_qty=float(row.get(qty_pg_column) or 0) if row.get(qty_pg_column) is not None else None,  # Use dynamic qty column
                    total_qty=float(row.get("total_qty") or 0) if row.get("total_qty") is not None else None,
                    inb_date=row.get("inb_date"),
                    valid_date=row.get("valid_date"),
                    prod_date=row.get("prod_date"),
                    uld=row.get("uld"),
                    extra_columns=row.get("extra_columns", {}),
                    fetched_at=row.get("fetched_at", ""),
                )
                items.append(item)
            except Exception as e:
                print(f"⚠️ Failed to create LocationInventoryItem for row {row.get('id')}: {e}")
                continue

        print(f"📊 [get_location_inventory] location='{location}' rows={len(rows)} items={len(items)} total_items={len(items)}")

        return LocationInventorySummary(
            location=location,
            zone=zone,
            total_items=len(items),
            total_quantity=total_quantity,
            unique_item_codes=unique_item_codes,
            items=items,
            last_updated=last_updated,
        )


async def get_rack_inventory(
    warehouse_code: str,
    rack_location: str
) -> LocationInventorySummary:
    """
    Get inventory for a rack by aggregating all locations matching the pattern
    E.g., rack_location="A03" will match "A03-01-01", "A03-02-03", etc.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json",
        }

        print(f"🏗️ Getting rack inventory for pattern: '{rack_location}-%'")

        # Initialize actual_warehouse_code
        actual_warehouse_code = warehouse_code

        # Get location column name from WMS source classification
        location_col_from_sheet = await get_location_column_for_warehouse(client, warehouse_code)

        if not location_col_from_sheet:
            print(f"⚠️ No location column configured for warehouse '{warehouse_code}', using default 'cell_no'")
            location_pg_column = "cell_no"
        else:
            from column_mapping import WMS_COLUMN_MAP
            location_pg_column = WMS_COLUMN_MAP.get(location_col_from_sheet, "cell_no")
            print(f"📊 Mapped '{location_col_from_sheet}' (Sheet) -> '{location_pg_column}' (PostgreSQL)")

        print(f"🔍 Rack '{rack_location}' will query PostgreSQL column '{location_pg_column}' with pattern '{rack_location}-%'")

        # Get other column mappings
        lot_col_from_sheet = await get_lot_column_for_warehouse(client, warehouse_code)
        lot_pg_column = WMS_COLUMN_MAP.get(lot_col_from_sheet, "lot_no") if lot_col_from_sheet else "lot_no"

        qty_col_from_sheet = await get_qty_column_for_warehouse(client, warehouse_code)
        qty_pg_column = WMS_COLUMN_MAP.get(qty_col_from_sheet, "available_qty") if qty_col_from_sheet else "available_qty"

        # Query all locations matching the rack pattern
        # Use ilike with * wildcards for PostgREST
        url = f"{SUPABASE_URL}/rest/v1/wms_raw_rows"
        query_params = {
            "warehouse_code": f"eq.{actual_warehouse_code}",
            f"{location_pg_column}": f"ilike.*{rack_location}-*",
            "select": f"id,warehouse_code,source_id,source_type,item_code,{location_pg_column},{lot_pg_column},{qty_pg_column},fetched_at",
            "limit": "10000"  # Reasonable limit for rack aggregation
        }

        print(f"🔍 Querying rack locations with pattern: {rack_location}-* (using ilike)")
        print(f"📋 Full query params: {query_params}")
        response = await client.get(url, headers=headers, params=query_params)
        response.raise_for_status()

        rows = response.json()
        print(f"📦 Found {len(rows)} rows for rack pattern '{rack_location}-*'")

        if len(rows) > 0:
            print(f"📋 Sample location values found: {[row.get(location_pg_column) for row in rows[:5]]}")
        else:
            print(f"⚠️ No rows found. Checking warehouse data...")
            # Check if any data exists for this warehouse
            test_params = {
                "warehouse_code": f"eq.{actual_warehouse_code}",
                "select": f"id,{location_pg_column}",
                "limit": "5"
            }
            test_response = await client.get(url, headers=headers, params=test_params)
            test_response.raise_for_status()
            test_rows = test_response.json()
            print(f"📋 Warehouse '{actual_warehouse_code}' has {len(test_rows)} rows total")
            if len(test_rows) > 0:
                print(f"📋 Sample location values: {[row.get(location_pg_column) for row in test_rows]}")
                print(f"💡 Try a different rack pattern or check if location data format matches '{rack_location}-*'")

        # Convert rows to LocationInventoryItem format
        items = []
        total_quantity = 0.0

        for row in rows:
            try:
                item = LocationInventoryItem(
                    id=int(row['id']),
                    item_code=str(row.get('item_code', '')),
                    lot_key=row.get(lot_pg_column),  # Use dynamic lot column
                    available_qty=float(row.get(qty_pg_column) or 0) if row.get(qty_pg_column) is not None else None,  # Use dynamic qty column
                    total_qty=float(row.get('total_qty') or 0) if row.get('total_qty') is not None else None,
                    inb_date=row.get('inb_date'),
                    valid_date=row.get('valid_date'),
                    prod_date=row.get('prod_date'),
                    uld=row.get('uld'),
                    extra_columns=row.get('extra_columns', {}),
                    fetched_at=row.get('fetched_at', ''),
                )
                items.append(item)
                total_quantity += float(row.get(qty_pg_column, 0) or 0)
            except Exception as e:
                print(f"⚠️ Failed to create LocationInventoryItem for row {row.get('id')} in rack: {e}")
                continue

        total_items = len(items)  # Each successful item
        unique_item_codes = len(set(item.item_code for item in items if item.item_code))

        print(f"📊 [get_rack_inventory] rack_location='{rack_location}' rows={len(rows)} items={len(items)} total_items={total_items}")

        # Get last updated timestamp
        last_updated = None
        if rows:
            timestamps = [row.get('fetched_at') for row in rows if row.get('fetched_at')]
            if timestamps:
                last_updated = max(timestamps)

        return LocationInventorySummary(
            location=rack_location,  # Use the rack base location
            zone="",  # Zone will be set by caller
            total_items=total_items,
            total_quantity=total_quantity,
            unique_item_codes=unique_item_codes,
            items=items,
            last_updated=last_updated,
        )


async def get_multiple_locations_inventory(
    warehouse_code: str,
    locations: List[str]
) -> Dict[str, LocationInventorySummary]:
    """
    Get inventory for multiple locations (batch query)
    """
    result = {}

    for location in locations:
        try:
            summary = await get_location_inventory(warehouse_code, location)
            result[location] = summary
        except Exception as e:
            print(f"Error fetching inventory for location {location}: {e}")
            # Return empty summary on error
            result[location] = LocationInventorySummary(
                location=location,
                zone="",
                total_items=0,
                total_quantity=0.0,
                unique_item_codes=0,
                items=[],
                last_updated=None,
            )

    return result
