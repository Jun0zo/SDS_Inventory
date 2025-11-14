#!/usr/bin/env python3
import os
from supabase import create_client

# Get Supabase credentials from environment or use defaults
url = os.environ.get("VITE_SUPABASE_URL", "https://your-project.supabase.co")
key = os.environ.get("VITE_SUPABASE_ANON_KEY", "your-anon-key")

supabase = create_client(url, key)

# Check what's actually in expiring_items_mv
print("=" * 80)
print("CHECKING all items in expiring_items_mv (first 20)")
print("=" * 80)

response = supabase.table("expiring_items_mv")\
    .select("*")\
    .limit(20)\
    .execute()

print(f"\nFound {len(response.data)} rows in expiring_items_mv:")
for i, row in enumerate(response.data, 1):
    print(f"\n{i}. Item: {row.get('item_code')}")
    print(f"   lot_key: {row.get('lot_key')}")
    print(f"   available_qty: {row.get('available_qty')}")
    print(f"   location: {row.get('location')}")
    print(f"   valid_date: {row.get('valid_date')}")
    print(f"   days_remaining: {row.get('days_remaining')}")
    print(f"   urgency: {row.get('urgency')}")
    print(f"   factory_location: {row.get('factory_location')}")

# Check if there are any rows with null lot_key or available_qty
print("\n" + "=" * 80)
print("CHECKING for rows with NULL lot_key or available_qty")
print("=" * 80)

response = supabase.table("expiring_items_mv")\
    .select("item_code, lot_key, available_qty, location")\
    .limit(100)\
    .execute()

null_lot_count = 0
null_qty_count = 0

for row in response.data:
    if row.get('lot_key') is None or row.get('lot_key') == '':
        null_lot_count += 1
        print(f"  NULL lot_key: {row.get('item_code')}")

    if row.get('available_qty') is None or row.get('available_qty') == 0:
        null_qty_count += 1
        print(f"  NULL/0 available_qty: {row.get('item_code')} (qty={row.get('available_qty')})")

print(f"\nSummary: {null_lot_count} rows with NULL lot_key, {null_qty_count} rows with NULL/0 available_qty")
