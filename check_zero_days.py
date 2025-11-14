#!/usr/bin/env python3
import os
from supabase import create_client

# Get Supabase credentials from environment or use defaults
url = os.environ.get("VITE_SUPABASE_URL", "https://your-project.supabase.co")
key = os.environ.get("VITE_SUPABASE_ANON_KEY", "your-anon-key")

supabase = create_client(url, key)

# Check items with days_remaining = 0
print("=" * 80)
print("CHECKING items with days_remaining = 0")
print("=" * 80)

response = supabase.table("expiring_items_mv")\
    .select("*")\
    .eq("days_remaining", 0)\
    .limit(20)\
    .execute()

print(f"\nFound {len(response.data)} rows with days_remaining = 0:")
for i, row in enumerate(response.data, 1):
    print(f"\n{i}. Item: {row.get('item_code')}")
    print(f"   lot_key: {row.get('lot_key')} (type: {type(row.get('lot_key'))})")
    print(f"   available_qty: {row.get('available_qty')} (type: {type(row.get('available_qty'))})")
    print(f"   location: {row.get('location')}")
    print(f"   valid_date: {row.get('valid_date')}")
    print(f"   urgency: {row.get('urgency')}")

# Check if 12500579 or 12000325 appear with days_remaining = 0
print("\n" + "=" * 80)
print("CHECKING specific items 12500579 and 12000325 in MV")
print("=" * 80)

for item_code in ["12500579", "12000325"]:
    response = supabase.table("expiring_items_mv")\
        .select("*")\
        .eq("item_code", item_code)\
        .execute()

    print(f"\n{item_code}: Found {len(response.data)} rows")
    if len(response.data) > 0:
        for row in response.data:
            print(f"  lot_key: {row.get('lot_key')}")
            print(f"  available_qty: {row.get('available_qty')}")
            print(f"  days_remaining: {row.get('days_remaining')}")
