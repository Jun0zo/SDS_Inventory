#!/usr/bin/env python3
"""Refresh location_inventory_summary_mv with updated production_lot_no logic"""
import sys
from pathlib import Path

# Add server directory to path
sys.path.insert(0, str(Path(__file__).parent / 'server'))

from supabase_client import supabase

def refresh_location_inventory_mv():
    """Refresh location_inventory_summary_mv"""
    if not supabase:
        print("❌ Supabase client not initialized")
        return False

    try:
        print("🔄 Refreshing location_inventory_summary_mv...")

        # Execute refresh
        result = supabase.rpc('exec_sql', {
            'sql': 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.location_inventory_summary_mv'
        }).execute()

        print("✅ location_inventory_summary_mv refreshed successfully")

        # Check row count
        count_result = supabase.from_('location_inventory_summary_mv').select('*', count='exact').limit(1).execute()
        print(f"📊 Total rows: {count_result.count}")

        return True

    except Exception as e:
        print(f"❌ Error refreshing materialized view: {e}")
        return False

if __name__ == '__main__':
    success = refresh_location_inventory_mv()
    sys.exit(0 if success else 1)
