"""Zone capacity management system using local JSON storage."""
import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path

try:
    # Try relative import first (when imported as part of server package)
    from .models_extended import ZoneCapacityInfo, ZoneCapacityResponse, ComponentInfo, LayoutInfo
    from .supabase_client import supabase
except ImportError:
    # Fallback to absolute import (when imported directly)
    from models_extended import ZoneCapacityInfo, ZoneCapacityResponse, ComponentInfo, LayoutInfo
    from supabase_client import supabase


class ZoneCapacityManager:
    """Manages zone capacity information stored in JSON files."""

    def __init__(self, data_dir: str = "data"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(exist_ok=True)
        self.capacity_file = self.data_dir / "zone_capacities.json"
        self.supabase = supabase

    def _load_capacities(self) -> Dict[str, Dict[str, Any]]:
        """Load zone capacity data from JSON file."""
        if not self.capacity_file.exists():
            return {}

        try:
            with open(self.capacity_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            print(f"Warning: Could not load zone capacities: {e}")
            return {}

    def _save_capacities(self, data: Dict[str, Dict[str, Any]]) -> None:
        """Save zone capacity data to JSON file."""
        try:
            with open(self.capacity_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False, default=str)
        except IOError as e:
            print(f"Error saving zone capacities: {e}")
            raise

    def calculate_zone_capacity(self, zone_data: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate max capacity for a zone based on its items."""
        total_capacity = 0
        item_count = 0

        items = zone_data.get('items', [])
        for item in items:
                item_count += 1
                item_type = item.get('type', '')
                max_capacity = item.get('max_capacity', 0)
                floor_capacities = item.get('floor_capacities', [])
                floors = item.get('floors', 0)
                rows = item.get('rows', 0)
                cols = item.get('cols', 0)

                if item_type == 'rack':
                    # For racks: Use floor_capacities array if available
                    if floor_capacities and isinstance(floor_capacities, list):
                        total_capacity += sum(cap or 0 for cap in floor_capacities)
                    else:
                        # Fallback: Calculate as floors × rows × cols
                        if floors and rows and cols:
                            total_capacity += floors * rows * cols
                elif item_type == 'flat':
                    # For flats: Use max_capacity if available
                    if max_capacity and max_capacity > 0:
                        total_capacity += max_capacity
                    else:
                        # Fallback: Calculate as rows × cols
                        if rows and cols:
                            total_capacity += rows * cols

        return {
            'max_capacity': total_capacity,
            'item_count': item_count
        }

    def update_zone_capacities(self, warehouse_codes: Optional[List[str]] = None) -> None:
        """Update capacity information for zones in specified warehouses."""
        try:
            # Get zones from database with items (layouts merged into zones)
            query = self.supabase.table('zones').select('''
                id,
                code,
                name,
                grid,
                items!zone_id(  -- items now reference zone_id directly
                    id,
                    type,
                    location,
                    x,
                    y,
                        rotation,
                        w,
                        h,
                        rows,
                        cols,
                        floors,
                        numbering,
                        order_dir,
                        per_floor_locations,
                        floor_capacities,
                        max_capacity
                    )
                )
            ''')

            # Note: warehouse_code filtering removed - zones table no longer has warehouse_code

            result = query.execute()
            zones = result.data or []

            # Load existing capacity data
            existing_data = self._load_capacities()
            updated_zones = set()

            # Update max capacities and component info
            for zone in zones:
                zone_id = str(zone['id'])
                capacity_info = self.calculate_zone_capacity(zone)

                # Build zone with components (layouts merged into zones)
                components = []
                for item in zone.get('items', []):
                    component = {
                        'id': str(item['id']),
                        'type': item['type'],
                        'location': item['location'],
                        'x': item['x'],
                        'y': item['y'],
                        'rotation': item.get('rotation', 0),
                        'w': item['w'],
                        'h': item['h'],
                        'rows': item['rows'],
                        'cols': item['cols']
                    }

                    # Add rack-specific fields
                    if item['type'] == 'rack':
                        component.update({
                            'floors': item.get('floors'),
                            'numbering': item.get('numbering'),
                            'order': item.get('order_dir'),
                            'per_floor_locations': item.get('per_floor_locations'),
                            'floor_capacities': item.get('floor_capacities')
                        })
                    else:  # flat
                        component['max_capacity'] = item.get('max_capacity')

                    components.append(component)

                if zone_id not in existing_data:
                    existing_data[zone_id] = {}

                existing_data[zone_id].update({
                    'zone_id': zone_id,
                    'zone_code': zone['code'],
                    'zone_name': zone.get('name'),
                    'max_capacity': capacity_info['max_capacity'],
                    'item_count': capacity_info['item_count'],
                    'components': components,  # Changed from layouts to components
                    'grid': zone.get('grid'),  # Added grid info from zones table
                    'last_updated': datetime.now().isoformat()
                })

                # Preserve current_stock and last_sync if they exist
                if 'current_stock' not in existing_data[zone_id]:
                    existing_data[zone_id]['current_stock'] = 0
                    existing_data[zone_id]['utilization_percentage'] = 0.0

                updated_zones.add(zone_id)

            # Remove zones that no longer exist
            zones_to_remove = []
            for zone_id in existing_data:
                if zone_id not in updated_zones:
                    zones_to_remove.append(zone_id)

            for zone_id in zones_to_remove:
                del existing_data[zone_id]

            # Save updated data
            self._save_capacities(existing_data)
            print(f"Updated capacities and components for {len(updated_zones)} zones")

        except Exception as e:
            print(f"Error updating zone capacities: {e}")
            raise

    def update_current_quantities_fast(self, warehouse_codes: Optional[List[str]] = None) -> None:
        """Update current quantities using pre-mapped materials information (fast method)."""
        print(f"🔄 Updating current quantities (FAST method) for warehouses: {warehouse_codes}")

        # Debug: Write to file
        with open('/tmp/debug_sync.log', 'w') as f:
            f.write("FAST method called\n")

        try:
            # Load existing capacity data
            existing_data = self._load_capacities()

            # Collect warehouse codes from zones if not provided
            # Note: warehouse_codes auto-detection removed - warehouse_code no longer used

            print(f"🔄 Updating current quantities (FAST method) for warehouses: {warehouse_codes}")

            # Process each zone and update current stock from pre-mapped materials
            updated_zones = 0
            for zone_id, zone_data in existing_data.items():
                zone_total_stock = 0
                # Update component-level data using pre-mapped materials
                components = zone_data.get('components', [])
                for comp in components:
                        comp_type = comp.get('type', '')
                        comp_location = comp.get('location', '').strip().upper()

                        # Use pre-mapped materials to calculate current stock
                        materials = comp.get('materials', [])
                        current_stock = len(materials)  # Each material entry represents one item

                        # Update component data
                        comp['current_stock'] = current_stock
                        zone_total_stock += current_stock

                        comp_max_cap = comp.get('max_capacity', 0)
                        if comp_max_cap > 0:
                            comp['utilization_percentage'] = (current_stock / comp_max_cap) * 100
                        else:
                            comp['utilization_percentage'] = 0.0

                # Pre-compute comprehensive display data for this zone (FAST method)
                zone_materials = []
                zone_max_capacity = existing_data[zone_id].get('max_capacity', 0)
                zone_current_stock = existing_data[zone_id].get('current_stock', 0)
                zone_utilization = existing_data[zone_id].get('utilization_percentage', 0.0)

                # Collect all component display info
                components_display = []
                for comp_data in components:
                    comp_materials = comp_data.get('materials', [])
                    zone_materials.extend(comp_materials)

                    # Create component display info
                    components_display.append({
                        'id': comp_data.get('id', ''),
                        'location': comp_data.get('location', ''),
                        'type': comp_data.get('type', ''),
                        'max_capacity': comp_data.get('max_capacity'),
                        'current_stock': len(comp_materials),
                        'utilization_percentage': comp_data.get('utilization_percentage', 0.0),
                        'materials': comp_materials
                    })

                # Calculate zone-level display data
                total_items = len(zone_materials)
                unique_skus = len(set(mat.get('item_code', '') for mat in zone_materials if mat.get('item_code')))

                # Lot distribution
                lot_counts = {}
                for mat in zone_materials:
                    lot_key = mat.get('lot_key') or 'NO_LOT'
                    lot_counts[lot_key] = lot_counts.get(lot_key, 0) + mat.get('quantity', 1)

                lot_distribution = []
                for lot_key, quantity in lot_counts.items():
                    percentage = (quantity / total_items * 100) if total_items > 0 else 0
                    lot_distribution.append({
                        'lot_key': lot_key if lot_key != 'NO_LOT' else None,
                        'quantity': quantity,
                        'percentage': round(percentage, 1)
                    })

                # Materials summary
                material_counts = {}
                material_lots = {}
                for mat in zone_materials:
                    item_code = mat.get('item_code', '')
                    lot_key = mat.get('lot_key') or 'NO_LOT'

                    if item_code:
                        material_counts[item_code] = material_counts.get(item_code, 0) + mat.get('quantity', 1)
                        if item_code not in material_lots:
                            material_lots[item_code] = set()
                        material_lots[item_code].add(lot_key)

                materials_summary = []
                for item_code, total_quantity in material_counts.items():
                    lots = list(material_lots[item_code])
                    if 'NO_LOT' in lots:
                        lots.remove('NO_LOT')
                    materials_summary.append({
                        'item_code': item_code,
                        'total_quantity': total_quantity,
                        'lots': lots
                    })

                # Sort by quantity descending
                lot_distribution.sort(key=lambda x: x['quantity'], reverse=True)
                materials_summary.sort(key=lambda x: x['total_quantity'], reverse=True)

                # Update zone with comprehensive cached display data
                existing_data[zone_id]['cached_display_data'] = {
                    'total_items': total_items,
                    'unique_skus': unique_skus,
                    'max_capacity': zone_max_capacity,
                    'current_stock': zone_current_stock,
                    'utilization_percentage': zone_utilization,
                    'lot_distribution': lot_distribution,
                    'materials_summary': materials_summary,
                    'components': components_display
                }

                # Update zone-level data
                existing_data[zone_id]['current_stock'] = zone_total_stock
                max_cap = existing_data[zone_id].get('max_capacity', 0)
                if max_cap > 0:
                    existing_data[zone_id]['utilization_percentage'] = (zone_total_stock / max_cap) * 100
                else:
                    existing_data[zone_id]['utilization_percentage'] = 0.0
                existing_data[zone_id]['last_sync'] = datetime.now().isoformat()

                updated_zones += 1

            # Save updated data
            self._save_capacities(existing_data)
            print(f"✅ Updated current quantities (FAST) for {updated_zones} zones")

        except Exception as e:
            print(f"Error updating current quantities (fast method): {e}")
            raise

    def update_current_quantities(self, warehouse_codes: Optional[List[str]] = None) -> None:
        """Update current quantities for zones and components based on WMS data."""
        try:
            # Debug: Write to file immediately
            with open('/tmp/debug_sync.log', 'w') as f:
                f.write("Function called\n")

            # Load existing capacity data first to get warehouse codes from zones
            existing_data = self._load_capacities()

            # Collect warehouse codes from zones if not provided
            # Note: warehouse_codes auto-detection removed - warehouse_code no longer used

            # Get WMS data (warehouse_code column removed)
            query = self.supabase.table('wms_raw_rows').select('zone_cd, zone, location, item_code, split_key')

            result = query.execute()
            wms_data = result.data or []
            print(f"📊 Fetched {len(wms_data)} WMS rows (all warehouses)")
            if wms_data:
                print(f"Sample WMS row: {wms_data[0]}")
                # Debug: Check zone/location fields
                zones_found = set()
                locations_found = set()
                for row in wms_data[:50]:  # Check first 50 rows
                    zone_cd = str(row.get('zone_cd') or '').strip()
                    zone = str(row.get('zone') or '').strip()
                    location = str(row.get('location') or '').strip()

                    if zone_cd:
                        zones_found.add(zone_cd)
                    if zone:
                        zones_found.add(zone)

                    if location:
                        locations_found.add(location)

                print(f"📍 Found zones (first 10): {sorted(list(zones_found))[:10]}")
                print(f"📍 Found locations (first 10): {sorted(list(locations_found))[:10]}")
                print(f"📍 Total unique zones: {len(zones_found)}, locations: {len(locations_found)}")

            # Get warehouse bindings to filter data per warehouse
            from supabase_client import supabase
            warehouse_source_split_mapping = {}  # warehouse_code -> list of (source_id, split_key) tuples

            for wh_code in warehouse_codes:
                try:
                    # Get warehouse ID
                    wh_result = supabase.table('warehouses').select('id').eq('code', wh_code).execute()
                    if wh_result.data and len(wh_result.data) > 0:
                        wh_id = wh_result.data[0]['id']

                        # Get bindings
                        binding_result = supabase.table('warehouse_bindings').select('source_bindings').eq('warehouse_id', wh_id).execute()
                        if binding_result.data and len(binding_result.data) > 0:
                            source_bindings = binding_result.data[0].get('source_bindings', {})
                            source_split_pairs = []
                            for key, binding_info in source_bindings.items():
                                if binding_info.get('type') == 'wms':
                                    # Extract source_id and split_value from key format: "source_id::split_value"
                                    if '::' in key:
                                        source_id, split_value = key.split('::', 1)
                                        source_split_pairs.append((source_id, split_value))
                            warehouse_source_split_mapping[wh_code] = source_split_pairs
                            print(f"📦 Warehouse {wh_code}: {len(source_split_pairs)} source/split pairs")
                            for sid, sv in source_split_pairs[:3]:
                                print(f"   - source={sid[:8]}..., split={sv}")
                except Exception as e:
                    print(f"Warning: Could not get bindings for warehouse {wh_code}: {e}")

            # Create per-warehouse location counts AND detailed item data
            location_counts: Dict[str, int] = {}  # location -> count (warehouse_code removed)
            location_items: Dict[str, List[Dict]] = {}  # location -> list of items (warehouse_code removed)

            # Fetch detailed WMS data - get all data since we filter by source_id/split_key
            try:
                query = self.supabase.table('wms_raw_rows').select('zone_cd, zone, location, item_code, split_key, source_id, lot_key, available_qty, tot_qty')
                result = query.execute()
                wms_data = result.data or []
                print(f"📊 Fetched {len(wms_data)} WMS rows with detailed data")

                # Debug: Write WMS data to file
                with open('/tmp/debug_sync.log', 'a') as f:
                    f.write(f"WMS query successful, got {len(wms_data)} rows\n")
                    if wms_data:
                        f.write(f"First row: {wms_data[0]}\n")
            except Exception as e:
                print(f"❌ WMS query failed: {e}")
                with open('/tmp/debug_sync.log', 'a') as f:
                    f.write(f"WMS query failed: {e}\n")
                wms_data = []

            # Debug: Show sample WMS data
            if wms_data:
                print("📊 Sample WMS data:")
                for row in wms_data[:3]:
                    print(f"   - loc={row.get('location')}, item={row.get('item_code')}, qty={row.get('quantity', 1)}")

            for row in wms_data:
                source_id = row.get('source_id', '')
                split_key = row.get('split_key', '')
                location = row.get('location', '').strip().upper()
                item_code = row.get('item_code', '').strip()
                lot_key = row.get('lot_key')
                quantity = row.get('available_qty', row.get('tot_qty', 1))  # Use available_qty, fallback to tot_qty, then 1

                # Debug: Log first few rows
                if len(location_counts) == 0:  # Only log for first row
                    with open('/tmp/debug_sync.log', 'a') as f:
                        f.write(f"First WMS row: source_id={source_id}, split_key={split_key}, location={location}\n")

                # Match this row to warehouse(s) based on source_id and split_key
                matched = False
                for wh_code, source_split_pairs in warehouse_source_split_mapping.items():
                    for expected_source_id, expected_split_value in source_split_pairs:
                        if source_id == expected_source_id and split_key == expected_split_value:
                            matched = True
                            # Location counts for quick lookup
                            if location:
                                location_counts[location] = location_counts.get(location, 0) + quantity

                            # Detailed item data per location
                            if location:
                                # location_items[location]이 리스트가 아니면 초기화
                                if location not in location_items:
                                    location_items[location] = []
                                elif location_items[location] is None:
                                    location_items[location] = []

                                location_items[location].append({
                                    'item_code': item_code,
                                    'lot_key': lot_key,
                                    'quantity': quantity,
                                    'source_id': source_id,
                                    'split_key': split_key
                                })

                # Debug: Log matching result for first few rows
                if len(location_counts) == 0 and not matched:  # Only log for first unmatched row
                    with open('/tmp/debug_sync.log', 'a') as f:
                        f.write(f"No match found for: source_id={source_id}, split_key={split_key}\n")
                        f.write(f"Available mappings: {warehouse_source_split_mapping}\n")

            # Debug output
            print(f"📍 Total locations with data: {len(location_counts)}")
            if location_counts:
                # Filter out None values before summing
                valid_counts = {k: v for k, v in location_counts.items() if v is not None}
                print(f"📍 Sample locations: {list(valid_counts.items())[:5]}")
                total_items = sum(valid_counts.values())
                print(f"📍 Total items across all locations: {total_items}")

            # Debug: Show EA2-F locations if available
            if 'EA2-F' in location_counts:
                ea2f_count = location_counts.get('EA2-F', 0) or 0
                print(f"📍 EA2-F items: {ea2f_count}")

            # Debug: Check what we have
            print(f"🔍 Total zones to process: {len(existing_data)}")
            print(f"🔍 Warehouse source/split mappings: {warehouse_source_split_mapping}")

            # Write debug info to file
            with open('/tmp/debug_sync.log', 'w') as f:
                f.write(f"Total zones: {len(existing_data)}\n")
                f.write(f"Warehouse mappings: {warehouse_source_split_mapping}\n")
                f.write(f"Location counts: {list(location_counts.keys())}\n")
                if 'EA2-F' in location_counts and location_counts['EA2-F'] is not None:
                    f.write(f"EA2-F count: {location_counts['EA2-F']}\n")
                f.write(f"Location items: {list(location_items.keys())}\n")
                if 'EA2-F' in location_items and location_items['EA2-F'] is not None:
                    f.write(f"EA2-F location items count: {len(location_items['EA2-F'])}\n")

            # Update zones and components
            updated_zones = 0
            for zone_id, zone_data in existing_data.items():
                if zone_data is None:
                    print(f"⚠️ Skipping zone {zone_id}: zone_data is None")
                    continue

                zone_total_stock = 0
                # Use global location_counts (warehouse_code removed)

                # Update component-level data first
                zone_code = zone_data.get('zone_code', '').strip()
                print(f"🔍 Processing zone: {zone_code}")

                # Create multiple variations of zone code for matching
                zone_variations = [
                    zone_code.upper().replace('-', ''),  # FZONE
                    zone_code.upper(),  # F-ZONE
                    zone_code.replace('-', '').upper(),  # FZONE
                ]
                if '-' in zone_code:
                    zone_variations.append(zone_code.split('-')[0].upper())  # F
                zone_variations = list(set(zone_variations))  # Remove duplicates

                print(f"🔍 Zone variations: {zone_variations}")

                # Debug: Show how many WMS rows match this zone
                matching_rows = 0
                for row in wms_data:
                    row_zone = (row.get('zone_cd') or row.get('zone') or '').strip().upper()
                    if any(var == row_zone for var in zone_variations):
                        matching_rows += 1
                print(f"🔍 Found {matching_rows} WMS rows matching zone variations")
                layouts = zone_data.get('layouts', [])
                if layouts is None:
                    layouts = []

                for layout in layouts:
                    if layout is None:
                        continue
                    components = layout.get('components', [])
                    if components is None:
                        components = []
                    for comp in components:
                        comp_location = comp.get('location', '').strip().upper()
                        comp_type = comp.get('type', '')

                        # Calculate current stock for this component based on materials
                        # Use materials length as current stock - more accurate than location_counts
                        current_stock = len(comp.get('materials', []))

                        # Update component data
                        comp['current_stock'] = current_stock
                        zone_total_stock += current_stock  # Add to zone total

                        comp_max_cap = comp.get('max_capacity', 0)
                        if comp_max_cap > 0:
                            comp['utilization_percentage'] = (current_stock / comp_max_cap) * 100
                        else:
                            comp['utilization_percentage'] = 0.0

                # Update materials mapping for this component using REAL WMS data
                comp_materials = []
                # Use global location_items (warehouse_code removed)
                print(f"🔍 Processing zone {zone_code}")
                if location_items:
                    print(f"🔍 Available WMS locations: {list(location_items.keys())}")
                else:
                    print(f"🔍 No WMS location data available")

                # TEMPORARY MAPPING: WMS zones to Zone Layout zones for testing
                # EAGLE2 -> F-zone, TRAILER -> A-zone
                wms_zone_to_layout_zone = {
                    'EAGLE2': 'F-zone',
                    'TRAILER': 'A-zone'
                }

                # Find WMS locations that belong to this layout zone
                matching_wms_locations = []
                if location_items:
                    for wms_zone, layout_zone in wms_zone_to_layout_zone.items():
                        if zone_code == layout_zone:
                            print(f"🔍 Found mapping: {wms_zone} -> {layout_zone}")
                            # Find all WMS locations for this zone
                            for loc in location_items.keys():
                                # Check if this WMS location belongs to the current WMS zone
                                # We need to match by checking WMS data - for now, use simple heuristics
                                if wms_zone == 'EAGLE2' and 'KITTING' in loc.upper():
                                    matching_wms_locations.append(loc)
                                    print(f"🔍 Matched EAGLE2 location: {loc}")
                                elif wms_zone == 'TRAILER' and '562' in loc:
                                    matching_wms_locations.append(loc)
                                    print(f"🔍 Matched TRAILER location: {loc}")

                # Filter out invalid locations
                valid_matching_locations = []
                for loc in matching_wms_locations:
                    if loc in location_items and location_items[loc] is not None and isinstance(location_items[loc], list):
                        valid_matching_locations.append(loc)
                    else:
                        print(f"⚠️ Skipping invalid location {loc}: not a valid list")
                matching_wms_locations = valid_matching_locations

                print(f"🔍 Matching WMS locations for {zone_code}: {matching_wms_locations}")

                if comp_type == 'flat':
                    # For flat components, try to match with WMS locations in the same zone
                    for wms_loc in matching_wms_locations:
                        if wms_loc in location_items and location_items[wms_loc] is not None and isinstance(location_items[wms_loc], list):
                            # Add actual WMS items for this location
                            comp_materials.extend(location_items[wms_loc])
                            print(f"📦 Flat component {comp_location}: Added {len(location_items[wms_loc])} items from WMS {wms_loc}")
                elif comp_type == 'rack':
                    # For rack components, distribute items from matching WMS locations
                    for wms_loc in matching_wms_locations:
                        if wms_loc in location_items and location_items[wms_loc] is not None and isinstance(location_items[wms_loc], list):
                            # Add actual WMS items for this sub-location
                            for item in location_items[wms_loc]:
                                item_copy = item.copy()
                                item_copy['location'] = comp_location  # Use component location
                                comp_materials.append(item_copy)
                            print(f"📦 Rack component {comp_location}: Added {len(location_items[wms_loc])} items from WMS {wms_loc}")

                print(f"📦 Component {comp_location}: Total {len(comp_materials)} real WMS items added")

                comp['materials'] = comp_materials
                print(f"📦 Component {comp_location}: Added {len(comp_materials)} sample materials")

                # Pre-compute comprehensive display data for this zone
                zone_materials = []
                zone_max_capacity = existing_data[zone_id].get('max_capacity', 0)
                zone_current_stock = existing_data[zone_id].get('current_stock', 0)
                zone_utilization = existing_data[zone_id].get('utilization_percentage', 0.0)

                # Collect all component display info
                components_display = []
                for comp_data in components:
                    comp_materials = comp_data.get('materials', [])
                    zone_materials.extend(comp_materials)

                    # Create component display info
                    components_display.append({
                        'id': comp_data.get('id', ''),
                        'location': comp_data.get('location', ''),
                        'type': comp_data.get('type', ''),
                        'max_capacity': comp_data.get('max_capacity'),
                        'current_stock': len(comp_materials),
                        'utilization_percentage': comp_data.get('utilization_percentage', 0.0),
                        'materials': comp_materials
                    })

                # Calculate zone-level display data
                total_items = len(zone_materials)
                unique_skus = len(set(mat.get('item_code', '') for mat in zone_materials if mat.get('item_code')))

                # Lot distribution
                lot_counts = {}
                for mat in zone_materials:
                    lot_key = mat.get('lot_key') or 'NO_LOT'
                    lot_counts[lot_key] = lot_counts.get(lot_key, 0) + mat.get('quantity', 1)

                lot_distribution = []
                for lot_key, quantity in lot_counts.items():
                    percentage = (quantity / total_items * 100) if total_items > 0 else 0
                    lot_distribution.append({
                        'lot_key': lot_key if lot_key != 'NO_LOT' else None,
                        'quantity': quantity,
                        'percentage': round(percentage, 1)
                    })

                # Materials summary
                material_counts = {}
                material_lots = {}
                for mat in zone_materials:
                    item_code = mat.get('item_code', '')
                    lot_key = mat.get('lot_key') or 'NO_LOT'

                    if item_code:
                        material_counts[item_code] = material_counts.get(item_code, 0) + mat.get('quantity', 1)
                        if item_code not in material_lots:
                            material_lots[item_code] = set()
                        material_lots[item_code].add(lot_key)

                materials_summary = []
                for item_code, total_quantity in material_counts.items():
                    lots = list(material_lots[item_code])
                    if 'NO_LOT' in lots:
                        lots.remove('NO_LOT')
                    materials_summary.append({
                        'item_code': item_code,
                        'total_quantity': total_quantity,
                        'lots': lots
                    })

                # Sort by quantity descending
                lot_distribution.sort(key=lambda x: x['quantity'], reverse=True)
                materials_summary.sort(key=lambda x: x['total_quantity'], reverse=True)

                # Update zone with comprehensive cached display data
                existing_data[zone_id]['cached_display_data'] = {
                    'total_items': total_items,
                    'unique_skus': unique_skus,
                    'max_capacity': zone_max_capacity,
                    'current_stock': zone_current_stock,
                    'utilization_percentage': zone_utilization,
                    'lot_distribution': lot_distribution,
                    'materials_summary': materials_summary,
                    'components': components_display
                }

                # Update zone-level data (sum of all component stocks)
                existing_data[zone_id]['current_stock'] = zone_total_stock
                max_cap = existing_data[zone_id].get('max_capacity', 0)
                if max_cap > 0:
                    existing_data[zone_id]['utilization_percentage'] = (zone_total_stock / max_cap) * 100
                else:
                    existing_data[zone_id]['utilization_percentage'] = 0.0
                existing_data[zone_id]['last_sync'] = datetime.now().isoformat()

                updated_zones += 1

            # Save updated data
            self._save_capacities(existing_data)
            print(f"Updated current quantities for {updated_zones} zones and their components")

        except Exception as e:
            print(f"Error updating current quantities: {e}")
            print(f"⚠️ Continuing with partial data (WMS data may be missing)")
            # Don't raise - allow partial success

    def get_zone_capacities(self, warehouse_codes: Optional[List[str]] = None) -> ZoneCapacityResponse:
        """Get zone capacity information with cached component data."""
        try:
            data = self._load_capacities()
            zones = []
            print(f"🔍 get_zone_capacities called with warehouse_codes: {warehouse_codes}")
            print(f"🔍 Total zones in data: {len(data)}")

            for zone_id, zone_data in data.items():
                # Note: warehouse_code filtering removed
                if zone_data is None:
                    print(f"⚠️ Skipping zone {zone_id}: zone_data is None")
                    continue

                # Convert zone components data to ComponentInfo objects
                components = []
                zone_components = zone_data.get('components', [])
                if zone_components is None:
                    print(f"⚠️ Zone {zone_id} has no components (None)")
                    zone_components = []

                for comp_data in zone_components:
                    component = ComponentInfo(
                        id=comp_data['id'],
                        type=comp_data['type'],
                        location=comp_data['location'],
                        x=comp_data['x'],
                        y=comp_data['y'],
                        rotation=comp_data.get('rotation', 0),
                        w=comp_data['w'],
                        h=comp_data['h'],
                        rows=comp_data['rows'],
                        cols=comp_data['cols'],
                        max_capacity=comp_data.get('max_capacity'),
                        current_stock=comp_data.get('current_stock', 0),
                        utilization_percentage=comp_data.get('utilization_percentage', 0.0),
                        materials=[MaterialInfo(**mat) for mat in comp_data.get('materials', [])]
                    )

                    # Add type-specific fields
                    if comp_data['type'] == 'rack':
                        component.floors = comp_data.get('floors')
                        component.numbering = comp_data.get('numbering')
                        component.order = comp_data.get('order')
                        component.per_floor_locations = comp_data.get('per_floor_locations')
                        component.floor_capacities = comp_data.get('floor_capacities')

                    components.append(component)

                # Create a single LayoutInfo for the zone
                layouts = [LayoutInfo(
                    id=zone_data['zone_id'],
                    zone_name=zone_data.get('zone_name', ''),
                    components=components
                )]

                zones.append(ZoneCapacityInfo(
                    zone_id=zone_data['zone_id'],
                    zone_code=zone_data['zone_code'],
                    zone_name=zone_data.get('zone_name'),
                    warehouse_code=None,  # warehouse_code removed
                    max_capacity=zone_data.get('max_capacity', 0),
                    current_stock=zone_data.get('current_stock', 0),
                    item_count=zone_data.get('item_count', 0),
                    utilization_percentage=zone_data.get('utilization_percentage', 0.0),
                    layouts=layouts,
                    cached_display_data=CachedDisplayData(**zone_data.get('cached_display_data', {})),
                    last_updated=datetime.fromisoformat(zone_data['last_updated']),
                    last_sync=datetime.fromisoformat(zone_data['last_sync']) if zone_data.get('last_sync') else None
                ))

            # Sort by utilization percentage (highest first)
            zones.sort(key=lambda z: z.utilization_percentage, reverse=True)

            last_updated = None
            if zones:
                last_updated = max(z.last_updated for z in zones)

            return ZoneCapacityResponse(
                zones=zones,
                total_zones=len(zones),
                last_updated=last_updated
            )

        except Exception as e:
            print(f"Error getting zone capacities: {e}")
            return ZoneCapacityResponse(zones=[], total_zones=0)

    def get_zone_capacity(self, zone_id: str) -> Optional[ZoneCapacityInfo]:
        """Get capacity information for a specific zone with cached component data."""
        data = self._load_capacities()
        zone_data = data.get(zone_id)

        if not zone_data:
            return None

        # Convert zone components data to ComponentInfo objects
        components = []
        for comp_data in zone_data.get('components', []):
            component = ComponentInfo(
                id=comp_data['id'],
                type=comp_data['type'],
                location=comp_data['location'],
                x=comp_data['x'],
                y=comp_data['y'],
                rotation=comp_data.get('rotation', 0),
                w=comp_data['w'],
                h=comp_data['h'],
                rows=comp_data['rows'],
                cols=comp_data['cols'],
                max_capacity=comp_data.get('max_capacity'),
                current_stock=comp_data.get('current_stock', 0),
                utilization_percentage=comp_data.get('utilization_percentage', 0.0)
            )

            # Add type-specific fields
            if comp_data['type'] == 'rack':
                component.floors = comp_data.get('floors')
                component.numbering = comp_data.get('numbering')
                component.order = comp_data.get('order')
                component.per_floor_locations = comp_data.get('per_floor_locations')
                component.floor_capacities = comp_data.get('floor_capacities')

            components.append(component)

        # Create a single LayoutInfo for the zone
        layouts = [LayoutInfo(
            id=zone_data['zone_id'],
            zone_name=zone_data.get('zone_name', ''),
            components=components
        )]

        return ZoneCapacityInfo(
            zone_id=zone_data['zone_id'],
            zone_code=zone_data['zone_code'],
            zone_name=zone_data.get('zone_name'),
            warehouse_code=None,  # warehouse_code removed
            max_capacity=zone_data.get('max_capacity', 0),
            current_stock=zone_data.get('current_stock', 0),
            item_count=zone_data.get('item_count', 0),
            utilization_percentage=zone_data.get('utilization_percentage', 0.0),
            layouts=layouts,
            cached_display_data=CachedDisplayData(**zone_data.get('cached_display_data', {})),
            last_updated=datetime.fromisoformat(zone_data['last_updated']),
            last_sync=datetime.fromisoformat(zone_data['last_sync']) if zone_data.get('last_sync') else None
        )


# Global instance
_zone_manager = None

def get_zone_capacity_manager() -> ZoneCapacityManager:
    """Get global zone capacity manager instance."""
    global _zone_manager
    if _zone_manager is None:
        _zone_manager = ZoneCapacityManager()
    return _zone_manager
