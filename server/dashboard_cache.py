"""
Dashboard Cache Manager
Pre-calculates and caches dashboard data for performance
Similar to inventory_snapshot.py but for dashboard KPIs and charts
"""

import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from pathlib import Path
from supabase_client import supabase


class DashboardCacheManager:
    """Manages dashboard cache data stored in JSON files."""

    def __init__(self, data_dir: str = "data"):
        self.data_dir = Path(__file__).parent / data_dir
        self.cache_dir = self.data_dir / "dashboard_cache"
        self.cache_dir.mkdir(exist_ok=True)
        # Cache for 30 minutes
        self.cache_duration = timedelta(minutes=30)

    def _get_cache_path(self, cache_key: str) -> Path:
        """Get path for cache file"""
        return self.cache_dir / f"{cache_key}.json"

    def _load_cache(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Load cache from file if not expired"""
        cache_path = self._get_cache_path(cache_key)
        if cache_path.exists():
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    cache_data = json.load(f)

                # Check if cache is still valid
                cached_at = datetime.fromisoformat(cache_data.get('cached_at', '2000-01-01T00:00:00'))
                if datetime.utcnow() - cached_at < self.cache_duration:
                    print(f"✅ Using dashboard cache for {cache_key}")
                    return cache_data
                else:
                    print(f"⏰ Dashboard cache expired for {cache_key}, refreshing...")
                    return None

            except Exception as e:
                print(f"Error loading dashboard cache for {cache_key}: {e}")
                return None
        return None

    def _save_cache(self, cache_key: str, data: Dict[str, Any]) -> None:
        """Save cache to file"""
        cache_path = self._get_cache_path(cache_key)
        try:
            cache_data = {
                'cached_at': datetime.utcnow().isoformat(),
                'data': data
            }
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(cache_data, f, ensure_ascii=False, indent=2, default=str)
            print(f"Saved dashboard cache for {cache_key}")
        except Exception as e:
            print(f"Error saving dashboard cache for {cache_key}: {e}")

    def _calculate_inventory_stats(self, warehouse_codes: List[str]) -> Dict[str, Any]:
        """Calculate inventory statistics"""
        print("Calculating inventory stats...")
        try:
            # Get WMS data (warehouse_code column removed)
            wms_query = supabase.table('wms_raw_rows').select('item_code, available_qty, source_id')
            # Note: warehouse_code filtering removed
            wms_result = wms_query.execute()
            wms_data = wms_result.data or []

            # Get SAP data (warehouse_code column removed)
            sap_query = supabase.table('sap_raw_rows').select('material, unrestricted_qty, quality_inspection_qty, blocked_qty, source_id')
            sap_result = sap_query.execute()
            sap_data = sap_result.data or []

            # Calculate totals
            total_wms_qty = sum(row.get('available_qty', 0) for row in wms_data if row.get('available_qty'))
            total_sap_qty = sum(
                row.get('unrestricted_qty', 0) +
                row.get('quality_inspection_qty', 0) +
                row.get('blocked_qty', 0)
                for row in sap_data
            )

            # Get unique items
            wms_items = set(row.get('item_code') for row in wms_data if row.get('item_code'))
            sap_items = set(row.get('material') for row in sap_data if row.get('material'))
            unique_items = len(wms_items.union(sap_items))

            return {
                'total_quantity': total_wms_qty + total_sap_qty,
                'unique_items': unique_items,
                'wms_quantity': total_wms_qty,
                'sap_quantity': total_sap_qty,
                'available_quantity': total_wms_qty + total_sap_qty,  # Simplified
                'last_updated': datetime.utcnow().isoformat()
            }

        except Exception as e:
            print(f"Error calculating inventory stats: {e}")
            raise

    def _calculate_zone_utilization(self, warehouse_codes: List[str]) -> List[Dict[str, Any]]:
        """Calculate zone utilization data from location_inventory_summary_mv"""
        print(f"Calculating zone utilization for warehouses: {warehouse_codes}")
        try:
            # Query location_inventory_summary_mv with warehouse filtering
            query = supabase.table('location_inventory_summary_mv').select(
                'item_zone, warehouse_code, current_stock_count, max_capacity, utilization_percentage, item_location'
            )

            # Apply warehouse_codes filter if specified
            if warehouse_codes:
                query = query.in_('warehouse_code', warehouse_codes)

            result = query.execute()
            print(f"Found {len(result.data or [])} location records from location_inventory_summary_mv")

            # Group by zone (item_zone) to calculate zone-level metrics
            zone_data = {}
            for record in result.data or []:
                zone_code = record.get('item_zone')
                if not zone_code:
                    continue

                warehouse_code = record.get('warehouse_code', 'EA2-F')

                if zone_code not in zone_data:
                    zone_data[zone_code] = {
                        'zone_code': zone_code,
                        'warehouse_code': warehouse_code,
                        'total_current_stock': 0,
                        'total_capacity': 0,
                        'location_count': 0,
                        'utilization_values': []
                    }

                # Accumulate data
                zone_data[zone_code]['total_current_stock'] += record.get('current_stock_count', 0)
                zone_data[zone_code]['total_capacity'] += record.get('max_capacity', 0)
                zone_data[zone_code]['location_count'] += 1
                zone_data[zone_code]['utilization_values'].append(record.get('utilization_percentage', 0))

            # Get zone names from zones table
            zone_codes = list(zone_data.keys())
            if zone_codes:
                zones_info = supabase.table('zones').select('id, code, name').in_('code', zone_codes).execute()
                zone_name_map = {zone['code']: zone['name'] for zone in zones_info.data or []}
                zone_id_map = {zone['code']: zone['id'] for zone in zones_info.data or []}
            else:
                zone_name_map = {}
                zone_id_map = {}

            # Calculate final metrics for each zone
            zones = []
            for zone_code, zone in zone_data.items():
                # Calculate utilization percentage based on total stock vs total capacity
                total_utilization = min(100, (zone['total_current_stock'] / zone['total_capacity']) * 100) if zone['total_capacity'] > 0 else 0

                # Calculate average utilization across locations
                avg_location_utilization = sum(zone['utilization_values']) / len(zone['utilization_values']) if zone['utilization_values'] else 0

                zones.append({
                    'zone_id': zone_id_map.get(zone_code),
                    'zone_code': zone_code,
                    'zone_name': zone_name_map.get(zone_code, zone_code),
                    'warehouse_code': zone['warehouse_code'],
                    'current_quantity': zone['total_current_stock'],
                    'total_capacity': zone['total_capacity'],
                    'utilization_percentage': total_utilization,
                    'avg_location_utilization': round(avg_location_utilization, 2),
                    'item_count': zone['location_count']
                })

            # Sort by utilization descending
            zones.sort(key=lambda x: x['utilization_percentage'], reverse=True)
            return zones[:10]  # Top 10 zones

        except Exception as e:
            print(f"Error calculating zone utilization from location_inventory_summary_mv: {e}")
            raise

    def _calculate_user_defined_zones(self, warehouse_codes: List[str]) -> List[Dict[str, Any]]:
        """Calculate user defined zones for heatmap"""
        print("Calculating user defined zones...")
        # Reuse zone utilization calculation
        return self._calculate_zone_utilization(warehouse_codes)

    def _calculate_expiring_items(self, warehouse_codes: List[str]) -> List[Dict[str, Any]]:
        """Calculate expiring items"""
        print("Calculating expiring items...")
        try:
            # Get WMS data with expiry dates (warehouse_code column removed)
            wms_query = supabase.table('wms_raw_rows').select('item_code, valid_date, available_qty, location')
            wms_result = wms_query.execute()
            wms_data = wms_result.data or []

            # Filter items expiring within 30 days
            expiring_items = []
            cutoff_date = datetime.utcnow() + timedelta(days=30)

            for row in wms_data:
                valid_date_str = row.get('valid_date')
                if valid_date_str:
                    try:
                        valid_date = datetime.fromisoformat(valid_date_str.replace('Z', '+00:00'))
                        if valid_date <= cutoff_date:
                            days_until_expiry = (valid_date - datetime.utcnow()).days
                            expiring_items.append({
                                'item_code': row.get('item_code'),
                                'location': row.get('location') or row.get('cell_no'),
                                'quantity': row.get('available_qty', 0),
                                'valid_date': valid_date_str,
                                'days_until_expiry': max(0, days_until_expiry),
                                'warehouse_code': row.get('warehouse_code')
                            })
                    except:
                        continue

            # Sort by expiry date (soonest first)
            expiring_items.sort(key=lambda x: x['days_until_expiry'])
            return expiring_items[:20]  # Top 20 expiring items

        except Exception as e:
            print(f"Error calculating expiring items: {e}")
            raise

    async def get_inventory_stats(self, warehouse_codes: List[str]) -> Dict[str, Any]:
        """Get cached or calculate inventory stats"""
        cache_key = f"inventory_stats_{'_'.join(sorted(warehouse_codes))}"

        # Try cache first
        cached = self._load_cache(cache_key)
        if cached:
            return cached['data']

        # Calculate and cache
        data = self._calculate_inventory_stats(warehouse_codes)
        self._save_cache(cache_key, data)
        return data

    async def get_zone_utilization(self, warehouse_codes: List[str]) -> List[Dict[str, Any]]:
        """Get cached or calculate zone utilization"""
        cache_key = f"zone_utilization_{'_'.join(sorted(warehouse_codes))}"

        cached = self._load_cache(cache_key)
        if cached:
            return cached['data']

        data = self._calculate_zone_utilization(warehouse_codes)
        self._save_cache(cache_key, data)
        return data

    async def get_user_defined_zones(self, warehouse_codes: List[str]) -> List[Dict[str, Any]]:
        """Get cached or calculate user defined zones"""
        cache_key = f"user_defined_zones_{'_'.join(sorted(warehouse_codes))}"

        cached = self._load_cache(cache_key)
        if cached:
            return cached['data']

        data = self._calculate_user_defined_zones(warehouse_codes)
        self._save_cache(cache_key, data)
        return data

    async def get_expiring_items(self, warehouse_codes: List[str]) -> List[Dict[str, Any]]:
        """Get cached or calculate expiring items"""
        cache_key = f"expiring_items_{'_'.join(sorted(warehouse_codes))}"

        cached = self._load_cache(cache_key)
        if cached:
            return cached['data']

        data = self._calculate_expiring_items(warehouse_codes)
        self._save_cache(cache_key, data)
        return data

    def clear_cache(self, pattern: Optional[str] = None) -> None:
        """Clear cache files matching pattern"""
        try:
            for cache_file in self.cache_dir.glob("*.json"):
                if not pattern or pattern in cache_file.name:
                    cache_file.unlink()
                    print(f"Cleared cache: {cache_file.name}")
        except Exception as e:
            print(f"Error clearing cache: {e}")


# Global instance
_dashboard_cache_manager = None

def get_dashboard_cache_manager() -> DashboardCacheManager:
    """Get global dashboard cache manager instance"""
    global _dashboard_cache_manager
    if _dashboard_cache_manager is None:
        _dashboard_cache_manager = DashboardCacheManager()
    return _dashboard_cache_manager
