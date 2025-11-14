#!/usr/bin/env python3
import os
from supabase import create_client

# Get Supabase credentials from environment or use defaults
url = os.environ.get("VITE_SUPABASE_URL", "https://your-project.supabase.co")
key = os.environ.get("VITE_SUPABASE_ANON_KEY", "your-anon-key")

supabase = create_client(url, key)

# Check raw data
print("=" * 80)
print("CHECKING wms_raw_rows FOR ITEMS 12500579 and 12000325")
print("=" * 80)

response = supabase.table("wms_raw_rows")\
    .select("item_code, production_lot_no, available_qty, tot_qty, cell_no")\
    .in_("item_code", ["12500579", "12000325"])\
    .limit(10)\
    .execute()

print(f"\nFound {len(response.data)} rows in wms_raw_rows:")
for row in response.data:
    print(f"  Item: {row.get('item_code')}")
    print(f"    production_lot_no: {row.get('production_lot_no')}")
    print(f"    available_qty: {row.get('available_qty')}")
    print(f"    tot_qty: {row.get('tot_qty')}")
    print(f"    cell_no: {row.get('cell_no')}")
    print()

# Check materialized view
print("=" * 80)
print("CHECKING expiring_items_mv")
print("=" * 80)

response = supabase.table("expiring_items_mv")\
    .select("item_code, lot_key, available_qty, location")\
    .in_("item_code", ["12500579", "12000325"])\
    .limit(10)\
    .execute()

print(f"\nFound {len(response.data)} rows in expiring_items_mv:")
for row in response.data:
    print(f"  Item: {row.get('item_code')}")
    print(f"    lot_key: {row.get('lot_key')}")
    print(f"    available_qty: {row.get('available_qty')}")
    print(f"    location: {row.get('location')}")
    print()
