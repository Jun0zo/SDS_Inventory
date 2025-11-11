"""
Inventory Snapshot Manager
Pre-calculates and caches inventory view data for performance
Similar to zone_capacity.py but for inventory listings
"""

import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path
from supabase_client import supabase


class InventorySnapshotManager:
    """Manages inventory snapshot data stored in JSON files."""

    def __init__(self, data_dir: str = "data"):
        self.data_dir = Path(__file__).parent / data_dir
        self.snapshots_dir = self.data_dir / "inventory_snapshots"
        print(f"📁 Creating snapshots directory: {self.snapshots_dir}")
        self.snapshots_dir.mkdir(parents=True, exist_ok=True)
        print(f"📁 Snapshots directory created: {self.snapshots_dir.exists()}")

    def _get_snapshot_path(self, warehouse_code: str) -> Path:
        """Get path for warehouse snapshot file"""
        return self.snapshots_dir / f"{warehouse_code}.json"

    def _load_snapshot(self, warehouse_code: str) -> Optional[Dict[str, Any]]:
        """Load snapshot from file"""
        snapshot_path = self._get_snapshot_path(warehouse_code)
        if snapshot_path.exists():
            try:
                with open(snapshot_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading snapshot for {warehouse_code}: {e}")
        return None

    def _save_snapshot(self, warehouse_code: str, data: Dict[str, Any]) -> None:
        """Save snapshot to file"""
        snapshot_path = self._get_snapshot_path(warehouse_code)
        try:
            with open(snapshot_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2, default=str)
            print(f"Saved inventory snapshot for {warehouse_code}: {len(data.get('wms_data', []))} WMS + {len(data.get('sap_data', []))} SAP rows")
        except Exception as e:
            print(f"Error saving snapshot for {warehouse_code}: {e}")

    async def update_inventory_snapshot(self, warehouse_code: str) -> None:
        """Update inventory snapshot for a warehouse"""
        print(f"🔄 STARTING inventory snapshot update for warehouse: {warehouse_code}")
        print(f"   Snapshots dir: {self.snapshots_dir}")
        print(f"   Snapshot path: {self._get_snapshot_path(warehouse_code)}")
        print(f"   Current time: {datetime.utcnow().isoformat()}")

        try:
            # Get warehouse binding
            from supabase_client import get_warehouse_binding
            print(f"   Getting warehouse binding for {warehouse_code}...")
            binding = await get_warehouse_binding(warehouse_code)
            print(f"   Warehouse binding result: {binding is not None}")

            if not binding or not binding.get('source_bindings'):
                print(f"   ❌ No bindings found for warehouse {warehouse_code}")
                print(f"   Binding details: {binding}")
                return

            print(f"   ✅ Found bindings for {warehouse_code}: {len(binding.get('source_bindings', {}))} sources")

            wms_data = []
            sap_data = []

            # Process each source binding
            source_bindings = binding['source_bindings']
            print(f"   Processing {len(source_bindings)} source bindings...")

            for bind_key, binding_info in source_bindings.items():
                print(f"   Processing binding: {bind_key}")

                # Extract source_id and split_value
                if '::' in bind_key:
                    source_id, split_value = bind_key.split('::', 1)
                    print(f"     Split binding: source_id={source_id}, split_value={split_value}")
                else:
                    source_id = bind_key
                    split_value = binding_info.get('split_value')
                    print(f"     Simple binding: source_id={source_id}, split_value={split_value}")

                bind_type = binding_info.get('type')
                print(f"     Binding type: {bind_type}")

                # Select table
                table_name = 'wms_raw_rows' if bind_type == 'wms' else 'sap_raw_rows'
                print(f"     Using table: {table_name}")

                # Build query - no limit to get all data
                query = supabase.table(table_name).select('*').eq('source_id', source_id)
                if split_value:
                    query = query.eq('split_key', split_value)
                    print(f"     Query with split filter: split_key = '{split_value}'")

                # Try to get all data at once first
                print(f"     Executing query for source {source_id}...")
                try:
                    result = query.execute()
                    print(f"     Direct query result: {len(result.data) if result.data else 0} rows")
                except Exception as e:
                    print(f"     Direct query failed: {e}, trying pagination...")
                    # Fallback to pagination
                    all_data = []
                    offset = 0
                    batch_size = 1000  # Use smaller batch size
                    max_iterations = 20

                    for iteration in range(max_iterations):
                        try:
                            # Create new query for each batch
                            batch_query = supabase.table(table_name).select('*').eq('source_id', source_id)
                            if split_value:
                                batch_query = batch_query.eq('split_key', split_value)

                            batch_result = batch_query.range(offset, offset + batch_size - 1).execute()

                            if not batch_result.data or len(batch_result.data) == 0:
                                print(f"     No more data at offset {offset}")
                                break

                            all_data.extend(batch_result.data)
                            print(f"     Batch {iteration + 1}: {len(batch_result.data)} rows (total: {len(all_data)})")

                            if len(batch_result.data) < batch_size:
                                break

                            offset += batch_size

                        except Exception as batch_e:
                            print(f"     Batch {iteration + 1} failed: {batch_e}")
                            break

                    print(f"     Pagination result: {len(all_data)} rows")
                    result = type('Result', (), {'data': all_data})()

                if result.data:
                    # Add metadata
                    for row in result.data:
                        row['source_type'] = bind_type
                        row['warehouse_code'] = warehouse_code

                    if bind_type == 'wms':
                        wms_data.extend(result.data)
                        print(f"     ✅ Added {len(result.data)} WMS rows (total WMS: {len(wms_data)})")
                    else:
                        sap_data.extend(result.data)
                        print(f"     ✅ Added {len(result.data)} SAP rows (total SAP: {len(sap_data)})")

                else:
                    print(f"     ⚠️ No data found for source {source_id}")

            # Create snapshot data
            snapshot_data = {
                'warehouse_code': warehouse_code,
                'wms_data': wms_data,
                'sap_data': sap_data,
                'total_wms': len(wms_data),
                'total_sap': len(sap_data),
                'last_updated': datetime.utcnow().isoformat(),
                'source_bindings': binding.get('source_bindings', {})
            }

            # Save to file
            print(f"   💾 Saving snapshot with {len(sap_data)} SAP + {len(wms_data)} WMS rows")
            self._save_snapshot(warehouse_code, snapshot_data)
            print(f"   ✅ Snapshot saved successfully for {warehouse_code}")

        except Exception as e:
            print(f"Error updating inventory snapshot for {warehouse_code}: {e}")
            raise

    def get_inventory_snapshot(self, warehouse_code: str) -> Optional[Dict[str, Any]]:
        """Get inventory snapshot for a warehouse"""
        return self._load_snapshot(warehouse_code)

    async def update_all_inventory_snapshots(self, warehouse_codes: Optional[List[str]] = None) -> None:
        """Update inventory snapshots for specified warehouses or all"""
        try:
            # Get all warehouses if not specified
            if warehouse_codes is None or len(warehouse_codes) == 0:
                # Get all warehouses with bindings
                result = supabase.table('warehouse_bindings').select('warehouses!inner(code)').execute()
                warehouse_codes = [binding['warehouses']['code'] for binding in result.data]

            print(f"Updating inventory snapshots for {len(warehouse_codes)} warehouses: {warehouse_codes}")

            for warehouse_code in warehouse_codes:
                try:
                    await self.update_inventory_snapshot(warehouse_code)
                except Exception as e:
                    print(f"Failed to update snapshot for {warehouse_code}: {e}")
                    # Continue with other warehouses

            print("Inventory snapshot updates completed")

        except Exception as e:
            print(f"Error updating inventory snapshots: {e}")
            raise


# Global instance
_inventory_snapshot_manager = None

def get_inventory_snapshot_manager() -> InventorySnapshotManager:
    """Get global inventory snapshot manager instance"""
    global _inventory_snapshot_manager
    if _inventory_snapshot_manager is None:
        _inventory_snapshot_manager = InventorySnapshotManager()
    return _inventory_snapshot_manager
